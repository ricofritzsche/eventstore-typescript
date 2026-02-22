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
import { buildQuery, buildAppendQuery } from './query';
import {
  mapDocumentsToEvents,
  extractMaxSequenceNumber,
  prepareEventsForInsert,
} from './transform';
import {
  createEventsCollection,
  createIndexes,
  getDatabaseNameFromConnectionString,
  changeDatabaseInConnectionString,
  EventDocument,
  EVENTS_COLLECTION_NAME,
} from './schema';
import { createFilter, createQuery } from '../../filter';
import { MemoryEventStreamNotifier } from '../../notifiers';

import { MongoClient, Db, Collection, Filter } from 'mongodb';

const NON_EXISTENT_EVENT_TYPE = '__NON_EXISTENT__' + Math.random().toString(36);

export interface MongoEventStoreOptions {
  connectionString?: string;
  databaseName?: string;
  notifier?: EventStreamNotifier;
}

/**
 * Represents an implementation of an event store using MongoDB as the underlying database.
 * Provides functionality to append events, query events, and manage database initialization.
 * Additionally, it facilitates event subscriptions through an event stream notifier mechanism.
 */
export class MongoEventStore implements EventStore {
  private client: MongoClient;
  private db: Db;
  private collection: Collection<EventDocument>;
  private sequenceCounterCollection: Collection<{ _id: string; sequence: number }>;
  private readonly databaseName: string;
  private readonly notifier: EventStreamNotifier;

  constructor(options: MongoEventStoreOptions = {}) {
    const connectionString =
      options.connectionString || process.env.MONGODB_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'eventstore-stores-mongodb-err02: Connection string missing. MONGODB_URL or DATABASE_URL environment variable not set.'
      );
    }

    // Get database name from options, connection string, or default
    let dbName = options.databaseName;
    if (!dbName) {
      const dbNameFromConnectionString = getDatabaseNameFromConnectionString(connectionString);
      if (!dbNameFromConnectionString) {
        throw new Error(
          'eventstore-stores-mongodb-err03: Database name not found. Provide databaseName option or include it in connection string: ' +
            connectionString
        );
      }
      dbName = dbNameFromConnectionString;
    }
    this.databaseName = dbName;

    this.client = new MongoClient(connectionString);
    this.db = this.client.db(this.databaseName);
    this.collection = this.db.collection<EventDocument>(EVENTS_COLLECTION_NAME);
    this.sequenceCounterCollection = this.db.collection<{ _id: string; sequence: number }>(
      '_sequence_counters'
    );

    // This is the "Default" EventStreamNotifier, but allow override
    this.notifier = options.notifier ?? new MemoryEventStreamNotifier();
  }

  async query(filterCriteria: EventQuery): Promise<QueryResult>;
  async query(filterCriteria: EventFilter): Promise<QueryResult>;
  async query(filterCriteria: EventQuery | EventFilter): Promise<QueryResult> {
    try {
      // If it's an EventFilter, wrap it in an EventQuery
      const eventQuery =
        'filters' in filterCriteria
          ? (filterCriteria as EventQuery)
          : createQuery(filterCriteria as EventFilter);

      const { filter, sort } = buildQuery(eventQuery);

      const docs = await this.collection
        .find(filter as unknown as Filter<EventDocument>)
        .sort(sort)
        .toArray();

      return {
        events: mapDocumentsToEvents(docs),
        maxSequenceNumber: extractMaxSequenceNumber(docs),
      };
    } catch (error) {
      throw new Error(`eventstore-stores-mongodb-err04: Query failed: ${error}`);
    }
  }

  async subscribe(handle: HandleEvents): Promise<EventSubscription> {
    return this.notifier.subscribe(handle);
  }

  async append(events: Event[]): Promise<void>;
  async append(
    events: Event[],
    filterCriteria: EventQuery,
    expectedMaxSequenceNumber: number
  ): Promise<void>;
  async append(
    events: Event[],
    filterCriteria: EventFilter,
    expectedMaxSequenceNumber: number
  ): Promise<void>;
  async append(
    events: Event[],
    filterCriteria?: EventQuery | EventFilter,
    expectedMaxSequenceNumber?: number
  ): Promise<void> {
    if (events.length === 0) return;

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
        'eventstore-stores-mongodb-err05: Expected max sequence number is required when a filter is provided!'
      );
    }

    try {
      let documentsToInsert: EventDocument[] = [];

      // Use a transaction to ensure atomicity of optimistic locking check and insertion
      const session = this.client.startSession();
      try {
        await session.withTransaction(async () => {
          // Get the current max sequence number for the context (for optimistic locking)
          const { maxSeqFilter } = buildAppendQuery(eventQuery, expectedMaxSequenceNumber);

          const maxSeqDoc = await this.collection
            .find(maxSeqFilter as unknown as Filter<EventDocument>, { session })
            .sort({ sequence_number: -1 })
            .limit(1)
            .toArray();

          const contextMaxSeq =
            maxSeqDoc.length > 0 && maxSeqDoc[0] ? maxSeqDoc[0].sequence_number : 0;

          // Verify optimistic locking
          if (contextMaxSeq !== expectedMaxSequenceNumber) {
            throw new Error(
              'eventstore-stores-mongodb-err06: Context changed: events were modified between query() and append()'
            );
          }

          // Atomically get the next sequence number using findOneAndUpdate
          // This ensures thread-safe sequence number generation, avoiding race conditions
          const counterResult = await this.sequenceCounterCollection.findOneAndUpdate(
            { _id: 'events' },
            { $inc: { sequence: events.length } },
            {
              upsert: true,
              returnDocument: 'after',
              session,
            }
          );

          // Calculate starting sequence number
          // If counter didn't exist, it starts at events.length (we'll subtract to get 1-based)
          const nextSequenceNumber = (counterResult?.sequence ?? events.length) - events.length + 1;

          // Prepare events for insertion
          const eventsToInsert = prepareEventsForInsert(events);
          const now = new Date();

          // Insert events with sequence numbers
          documentsToInsert = eventsToInsert.map((event, index) => ({
            sequence_number: nextSequenceNumber + index,
            occurred_at: now,
            event_type: event.event_type,
            payload: event.payload,
          }));

          const result = await this.collection.insertMany(documentsToInsert, { session });

          if (result.insertedCount !== events.length) {
            throw new Error(
              `eventstore-stores-mongodb-err07: Failed to insert all events. Expected ${events.length}, inserted ${result.insertedCount}`
            );
          }
        });
      } finally {
        await session.endSession();
      }

      // Convert inserted documents to EventRecord[] and notify subscribers
      // (after transaction commits successfully)
      const insertedEvents = mapDocumentsToEvents(documentsToInsert);
      await this.notifier.notify(insertedEvents);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Context changed')) {
        throw error;
      }
      throw new Error(`eventstore-stores-mongodb-err08: Append failed: ${error}`);
    }
  }

  async initializeDatabase(): Promise<void> {
    await this.createDatabase();
    await this.createTableAndIndexes();
  }

  async close(): Promise<void> {
    await this.notifier.close();
    await this.client.close();
  }

  private async createDatabase(): Promise<void> {
    // MongoDB creates databases automatically when you first write to them
    // So we just need to ensure the database exists by creating a collection
    // This is handled in createTableAndIndexes
    try {
      // Test connection by listing collections
      await this.db.listCollections().toArray();
      console.log(`Database ready: ${this.databaseName}`);
    } catch (err: any) {
      throw new Error(
        `eventstore-stores-mongodb-err09: Failed to connect to database: ${err.message}`
      );
    }
  }

  private async createTableAndIndexes(): Promise<void> {
    try {
      const collection = await createEventsCollection(this.db);
      await createIndexes(collection);
      this.collection = collection;

      // Initialize sequence counter if it doesn't exist
      const counterExists = await this.sequenceCounterCollection.findOne({ _id: 'events' });
      if (!counterExists) {
        await this.sequenceCounterCollection.insertOne({ _id: 'events', sequence: 0 });
      }

      console.log(`Collection and indexes created: ${EVENTS_COLLECTION_NAME}`);
    } catch (err: any) {
      throw new Error(
        `eventstore-stores-mongodb-err10: Failed to create collection/indexes: ${err.message}`
      );
    }
  }
}
