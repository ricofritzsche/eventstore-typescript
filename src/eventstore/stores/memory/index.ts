import { Event, EventStore, EventRecord, EventFilter, QueryResult, EventStreamNotifier, HandleEvents, EventSubscription } from '../../types';
import { MemoryEventStreamNotifier } from '../../notifiers';

import { EventStream } from './eventstream';
import { processQuery } from './queryprocessor';
import { ReadWriteLockFIFO } from "./readwritelock"


export class MemoryEventStore implements EventStore {
  private eventStream = new EventStream();
  private notifier: EventStreamNotifier = new MemoryEventStreamNotifier();
  private lock: ReadWriteLockFIFO = new ReadWriteLockFIFO();

  async query(filter?: EventFilter): Promise<QueryResult> {
    return await this.queryWithLock(filter, this.lock);
  }

  async queryWithLock(filter?: EventFilter, lock?: ReadWriteLockFIFO): Promise<QueryResult> {
    if (lock)
        await lock.acquireRead();
    try {
        const matchingEvents = processQuery(this.eventStream.eventRecords, filter);
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


  async append(events: Event[], filter?: EventFilter,  expectedMaxSequenceNumber?: number): Promise<void> {
    await this.lock.acquireWrite();
    try {
        if (expectedMaxSequenceNumber) {
            const currentQueryResult = await this.queryWithLock(filter, undefined);
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
}