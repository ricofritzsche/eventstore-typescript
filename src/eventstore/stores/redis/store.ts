import {
  Event,
  EventStore,
  QueryResult,
  EventStreamNotifier,
  HandleEvents,
  EventSubscription,
  EventQuery,
  EventFilter,
} from '../../types';
import { compileQueryFilter, getEventTypesToQuery } from './query';
import {
  mapStreamEntriesToEvents,
  mapDocumentsToEvents,
  extractMaxSequenceNumber,
  prepareEventForStreamStorage,
  prepareEventForStorage,
  streamEntryToEventDocument,
  StreamEntry,
  EventDocument,
} from './transform';
import {
  STREAM_KEY,
  SEQUENCE_COUNTER_KEY,
  getEventTypeIndexKey,
  getDatabaseNameFromConnectionString,
} from './schema';
import { createFilter, createQuery } from '../../filter';
import { RedisPubSubNotifier } from '../../notifiers';

import { createClient } from 'redis';

const NON_EXISTENT_EVENT_TYPE = '__NON_EXISTENT__' + Math.random().toString(36);


export interface RedisEventStoreOptions {
  connectionString?: string;
  database?: number;
  notifier?: EventStreamNotifier;
  /**
   * Hint for SCAN iterator batch size (keys per iteration).
   * Higher values may improve performance but use more memory.
   * Default: undefined (uses Redis default, typically 10)
   */
  scanCount?: number;
}

/**
 * Represents an implementation of an event store using Redis as the underlying database.
 * Provides functionality to append events, query events, and manage database initialization.
 * Additionally, it facilitates event subscriptions through an event stream notifier mechanism.
 */
export class RedisEventStore implements EventStore {
  private client: ReturnType<typeof createClient>;
  private readonly database: number;
  private readonly notifier: EventStreamNotifier;
  private readonly scanCount: number | undefined;

  constructor(options: RedisEventStoreOptions = {}) {
    const connectionString = options.connectionString || process.env.REDIS_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'eventstore-stores-redis-err02: Connection string missing. REDIS_URL or DATABASE_URL environment variable not set.'
      );
    }

    // Get database number from options, connection string, or default to 0
    this.database = options.database ?? getDatabaseNameFromConnectionString(connectionString);

    this.client = createClient({
      url: connectionString,
      database: this.database,
    });

    // Use Redis Pub/Sub notifier by default for cross-process notifications
    // Users can override with their own notifier if needed
    this.notifier = options.notifier ?? new RedisPubSubNotifier({
      connectionString,
      database: this.database,
    });
    this.scanCount = options.scanCount;
  }

  async query(filterCriteria: EventQuery): Promise<QueryResult>;
  async query(filterCriteria: EventFilter): Promise<QueryResult>;
  async query(filterCriteria: EventQuery | EventFilter): Promise<QueryResult> {
    try {
      // Ensure client is connected
      if (!this.client.isOpen) {
        await this.client.connect();
      }

      // If it's an EventFilter, wrap it in an EventQuery
      const eventQuery =
        'filters' in filterCriteria
          ? (filterCriteria as EventQuery)
          : createQuery(filterCriteria as EventFilter);

      // Get event types to query (for optimization)
      const eventTypesToQuery = getEventTypesToQuery(eventQuery);
      const filterFn = compileQueryFilter(eventQuery);

      // Fetch all events from Redis Stream using XRANGE
      // XRANGE returns entries from start (-) to end (+)
      // Redis client returns objects with { id, message } structure
      const streamEntriesRaw = await this.client.xRange(STREAM_KEY, '-', '+');
      
      // Convert Redis stream entries to StreamEntry format [id, [field1, value1, ...]]
      const streamEntries: StreamEntry[] = streamEntriesRaw.map((entry) => {
        const fields: string[] = [];
        for (const [key, value] of Object.entries(entry.message)) {
          fields.push(key, typeof value === 'string' ? value : String(value));
        }
        return [entry.id, fields];
      });
      
      // Convert stream entries to EventDocuments
      const allEventDocs: EventDocument[] = streamEntries.map(streamEntryToEventDocument);

      // Filter events based on query criteria
      const filteredDocs = allEventDocs.filter((doc) => filterFn(doc));

      // Sort by sequence number (should already be sorted by stream ID, but ensure it)
      filteredDocs.sort((a, b) => a.sequence_number - b.sequence_number);

      return {
        events: mapDocumentsToEvents(filteredDocs),
        maxSequenceNumber: extractMaxSequenceNumber(filteredDocs),
      };
    } catch (error) {
      throw new Error(`eventstore-stores-redis-err04: Query failed: ${error}`);
    }
  }

  async subscribe(handle: HandleEvents): Promise<EventSubscription> {
    return this.notifier.subscribe(handle);
  }

  async append(events: Event[]): Promise<void>;
  async append(events: Event[], filterCriteria: EventQuery, expectedMaxSequenceNumber: number): Promise<void>;
  async append(events: Event[], filterCriteria: EventFilter, expectedMaxSequenceNumber: number): Promise<void>;
  async append(
    events: Event[],
    filterCriteria?: EventQuery | EventFilter,
    expectedMaxSequenceNumber?: number
  ): Promise<void> {
    if (events.length === 0) return;

    // Ensure client is connected
    if (!this.client.isOpen) {
      await this.client.connect();
    }

    // Convert EventFilter to EventQuery if needed
    let eventQuery: EventQuery;
    if (filterCriteria === undefined) {
      eventQuery = createQuery(createFilter([NON_EXISTENT_EVENT_TYPE]));
      expectedMaxSequenceNumber = 0;
    } else if ('filters' in filterCriteria) {
      // It's an EventQuery
      eventQuery = filterCriteria;
      if (eventQuery.filters.length === 0) {
        eventQuery = createQuery(createFilter([NON_EXISTENT_EVENT_TYPE]));
        expectedMaxSequenceNumber = 0;
      }
    } else {
      // It's an EventFilter, wrap it in EventQuery
      eventQuery = createQuery(filterCriteria);
    }

    if (expectedMaxSequenceNumber === undefined) {
      throw new Error(
        'eventstore-stores-redis-err05: Expected max sequence number is required when a filter is provided!'
      );
    }

    try {
      // Use WATCH/MULTI/EXEC pattern for atomic optimistic locking
      // Retry loop in case of watch failure (another transaction modified watched keys)
      const maxRetries = 10;
      let retries = 0;
      let success = false;
      let documentsToStore: EventDocument[] = [];
      const streamIds: string[] = [];

      while (!success && retries < maxRetries) {
        // Watch the sequence counter to detect concurrent modifications
        await this.client.watch(SEQUENCE_COUNTER_KEY);

        // Get the current max sequence number for the context using XREVRANGE
        // XREVRANGE gets the latest entries from the stream (reverse order)
        // We read events in reverse order and stop when we find matching events
        const filterFn = compileQueryFilter(eventQuery);
        
        // Use XREVRANGE to get latest events (most efficient for finding max sequence)
        // Read in batches until we find events matching the filter
        let contextMaxSeq = 0;
        let lastId = '+'; // Start from the end
        const batchSize = 100; // Read events in batches
        
        // Read events in reverse order until we have enough context
        while (true) {
          const entriesRaw = await this.client.xRevRange(STREAM_KEY, lastId, '-', { COUNT: batchSize });
          
          if (entriesRaw.length === 0) {
            break; // No more events
          }
          
          // Convert Redis stream entries to StreamEntry format [id, [field1, value1, ...]]
          const entries: StreamEntry[] = entriesRaw.map((entry) => {
            const fields: string[] = [];
            for (const [key, value] of Object.entries(entry.message)) {
              fields.push(key, typeof value === 'string' ? value : String(value));
            }
            return [entry.id, fields];
          });
          
          // Check entries in this batch
          let foundMatch = false;
          for (const entry of entries) {
            const doc = streamEntryToEventDocument(entry);
            if (filterFn(doc)) {
              contextMaxSeq = Math.max(contextMaxSeq, doc.sequence_number);
              foundMatch = true;
            }
          }
          
          // If we found matches and we've read enough, we can stop
          // For optimistic locking, we need the absolute max, so continue reading
          // But we can optimize: if current max is already >= expected, we can stop early
          if (contextMaxSeq >= expectedMaxSequenceNumber) {
            break; // Already found a sequence >= expected, no need to continue
          }
          
          // Move to next batch (earlier in time)
          const lastEntry = entries[entries.length - 1];
          if (lastEntry) {
            // Extract stream ID from tuple: [streamId, fieldValuePairs]
            const [lastStreamId] = lastEntry;
            lastId = `(${lastStreamId}`; // Exclusive range for next batch
          } else {
            break;
          }
          
          // Safety: if we've read all events, stop
          if (entries.length < batchSize) {
            break;
          }
        }

        // Verify optimistic locking
        if (contextMaxSeq !== expectedMaxSequenceNumber) {
          await this.client.unwatch();
          throw new Error(
            'eventstore-stores-redis-err06: Context changed: events were modified between query() and append()'
          );
        }

        // Get current counter value (while watching) to calculate sequence numbers
        const currentCounter = await this.client.get(SEQUENCE_COUNTER_KEY);
        const currentCounterValue = currentCounter ? parseInt(currentCounter, 10) : 0;
        const startSequenceNumber = currentCounterValue + 1;

        // Prepare all event data with correct sequence numbers
        const now = new Date();
        documentsToStore = [];
        streamIds.length = 0; // Clear previous stream IDs
        const multi = this.client.multi();

        // Increment counter once for all events
        multi.incrBy(SEQUENCE_COUNTER_KEY, events.length);

        // Track which events were actually processed (for index alignment)
        const processedEventIndices: number[] = [];
        
        // Add events to stream using XADD
        for (let i = 0; i < events.length; i++) {
          const event = events[i];
          if (!event) continue;
          
          processedEventIndices.push(i); // Track that this event was processed
          const sequenceNumber = startSequenceNumber + i;
          const streamFields = prepareEventForStreamStorage(event, sequenceNumber, now);
          
          // XADD returns the stream ID, we'll capture it after execution
          // For now, use '*' to let Redis generate the ID
          multi.xAdd(STREAM_KEY, '*', streamFields);
          
          // Store document for notification (we'll update streamId after execution)
          const doc = prepareEventForStorage(event, sequenceNumber, now);
          documentsToStore.push(doc);
        }

        // Execute transaction atomically
        // If watched keys changed, execResult will be null and we retry
        const execResult = await multi.exec();

        if (execResult === null) {
          // Transaction was aborted (counter was modified), retry
          retries++;
          continue;
        }

        // Extract stream IDs from XADD results
        // execResult is an array of command results in order
        // Each XADD returns a stream ID string
        // Map stream IDs to their original event indices
        const streamIdMap = new Map<number, string>(); // Maps original event index -> stream ID
        
        if (execResult) {
          let xaddIndex = 1; // First command is INCRBY, then XADD commands
          for (let docIndex = 0; docIndex < documentsToStore.length; docIndex++) {
            const streamId = execResult[xaddIndex] as string | undefined;
            const originalEventIndex = processedEventIndices[docIndex];
            
            // Verify we have both streamId and originalEventIndex
            if (streamId && originalEventIndex !== undefined) {
              streamIdMap.set(originalEventIndex, streamId);
              documentsToStore[docIndex]!.streamId = streamId;
            } else {
              // This shouldn't happen, but log if it does
              throw new Error(
                `eventstore-stores-redis-err11: Stream ID extraction failed at docIndex ${docIndex}, ` +
                `streamId: ${streamId}, originalEventIndex: ${originalEventIndex}`
              );
            }
            xaddIndex++;
          }
          
          // Verify we processed all expected events
          if (streamIdMap.size !== documentsToStore.length) {
            throw new Error(
              `eventstore-stores-redis-err12: Stream ID map size mismatch. ` +
              `Expected ${documentsToStore.length}, got ${streamIdMap.size}`
            );
          }
        }

        // Update indexes with stream IDs using Sorted Sets (outside transaction for now)
        // Use sequence number as score for efficient range queries
        // We could include these in the transaction, but ZADD doesn't need to be atomic with XADD
        // Use the streamIdMap to correctly map stream IDs to their original event indices
        for (let i = 0; i < events.length; i++) {
          const event = events[i];
          if (!event) continue;
          
          const streamId = streamIdMap.get(i);
          if (!streamId) {
            // This shouldn't happen - streamId should exist for all processed events
            // Skip this event to avoid incorrect indexing
            continue;
          }
          
          const indexKey = getEventTypeIndexKey(event.eventType);
          const sequenceNumber = startSequenceNumber + i;
          
          // Add stream ID to sorted set with sequence number as score
          // This enables efficient range queries by sequence number
          await this.client.zAdd(indexKey, {
            score: sequenceNumber,
            value: streamId,
          });
        }

        success = true;

        // Convert stored documents to EventRecord[] and notify subscribers
        const insertedEvents = mapDocumentsToEvents(documentsToStore);
        await this.notifier.notify(insertedEvents);
      }

      if (!success) {
        throw new Error(
          'eventstore-stores-redis-err10: Failed to append events after maximum retries (concurrent modification detected)'
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('Context changed')) {
        throw error;
      }
      throw new Error(`eventstore-stores-redis-err08: Append failed: ${error}`);
    }
  }

  async initializeDatabase(): Promise<void> {
    // Redis doesn't require explicit database creation
    // Just ensure connection is established
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    
    // Initialize sequence counter if it doesn't exist
    const exists = await this.client.exists(SEQUENCE_COUNTER_KEY);
    if (!exists) {
      await this.client.set(SEQUENCE_COUNTER_KEY, '0');
    }
  }

  async close(): Promise<void> {
    await this.notifier.close();
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }
}

