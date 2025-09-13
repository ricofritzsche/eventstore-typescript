import { Event, EventStore, EventRecord, EventFilter, EventQuery, QueryResult, EventStreamNotifier, HandleEvents, EventSubscription } from '../../types';
import { MemoryEventStreamNotifier } from '../../notifiers';
import { createQuery } from '../../filter';

import { EventStream } from './eventstream';
import { processQuery } from './queryprocessor';
import { ReadWriteLockFIFO } from "./readwritelock"


export class MemoryEventStore implements EventStore {
  private eventStream = new EventStream();
  private notifier: EventStreamNotifier = new MemoryEventStreamNotifier();
  private lock: ReadWriteLockFIFO = new ReadWriteLockFIFO();

  async query(): Promise<QueryResult>;
  async query(eventQuery: EventQuery): Promise<QueryResult>;
  async query(eventFilter: EventFilter): Promise<QueryResult>;
  async query(queryOrFilter?: EventQuery | EventFilter): Promise<QueryResult> {
    // If it's an EventFilter, wrap it in an EventQuery
    const eventQuery = queryOrFilter && !('filters' in queryOrFilter)
      ? createQuery(queryOrFilter as EventFilter)
      : queryOrFilter as EventQuery | undefined;

    return await this.queryWithLock(eventQuery, this.lock);
  }

  async queryWithLock(query?: EventQuery, lock?: ReadWriteLockFIFO): Promise<QueryResult> {
    if (lock)
        await lock.acquireRead();
    try {
        const matchingEvents = processQuery(this.eventStream.eventRecords, query);
        const maxSequenceNumber = matchingEvents.length > 0 ? matchingEvents[matchingEvents.length - 1]?.sequenceNumber : 0;
        return {
            events: matchingEvents,
            maxSequenceNumber: maxSequenceNumber || 0
        };
    }
    finally {
        if (lock) lock.releaseRead();
    }
  }

  async queryAll(): Promise<QueryResult> {
    const events = this.eventStream.eventRecords;
    const maxSequenceNumber = events.length > 0 ? events[events.length - 1]?.sequenceNumber || 0 : 0;
    return {
      events,
      maxSequenceNumber
     };
  }


  async append(events: Event[]): Promise<void>;
  async append(events: Event[], filterCriteria: EventQuery, expectedMaxSequenceNumber: number): Promise<void>;
  async append(events: Event[], filterCriteria: EventFilter, expectedMaxSequenceNumber: number): Promise<void>;
  async append(events: Event[], queryOrFilter?: EventQuery | EventFilter,  expectedMaxSequenceNumber?: number): Promise<void> {
    await this.lock.acquireWrite();
    try {
        if (expectedMaxSequenceNumber) {
            // Convert EventFilter to EventQuery if needed
            const eventQuery = queryOrFilter && !('filters' in queryOrFilter)
              ? createQuery(queryOrFilter as EventFilter)
              : queryOrFilter as EventQuery | undefined;
              
            const currentQueryResult = await this.queryWithLock(eventQuery, undefined);
            if ((currentQueryResult).maxSequenceNumber !== expectedMaxSequenceNumber) {
                throw new Error('eventstore-stores-memory-err05: Context changed: events were modified between query() and append()');
            }
        }

        const eventRecords = this.eventStream.append(events);

        await this.notifier.notify(eventRecords);
            // TODO: or should this be moved after the lock release? would probably require queueing notifications to keep them in order
    }
    finally {
        this.lock.releaseWrite();
    }
  }


  async subscribe(handle: HandleEvents): Promise<EventSubscription> {
    return await this.notifier.subscribe(handle);
  }


  async storeToFile(filename: string): Promise<void> {
    const fs = await import('fs/promises');
    const data = this.eventStream.serialize();
    await fs.writeFile(filename, data, { encoding: 'utf-8' });
  }

  static async createFromFile(filename: string): Promise<MemoryEventStore> {
    const fs = await import('fs/promises');
    const data = await fs.readFile(filename, { encoding: 'utf-8' });
    const eventStream = EventStream.deserialize(data);
    const store = new MemoryEventStore();
    store.eventStream = eventStream;
    return store;
  }  
}
