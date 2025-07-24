import { Event, EventStore, EventRecord, EventFilter, QueryResult, EventStreamNotifier, HandleEvents, EventSubscription } from '../../types';
import { MemoryEventStreamNotifier } from '../../notifiers';

import { EventStream } from './eventstream';
import { processQuery } from './queryprocessor';


export class MemoryEventStore implements EventStore {
  private eventStream = new EventStream();
  private notifier: EventStreamNotifier = new MemoryEventStreamNotifier();


  async query(filter?: EventFilter): Promise<QueryResult> {
    /*
    read-lock
    */
    const matchingEvents = processQuery(this.eventStream.eventRecords, filter);
    const maxSequenceNumber = matchingEvents.length > 0 ? matchingEvents[matchingEvents.length - 1]?.sequenceNumber : 0;
    return { 
        events: matchingEvents,
        maxSequenceNumber: maxSequenceNumber || 0
    };
  }


  async append(events: Event[], filter?: EventFilter,  expectedMaxSequenceNumber?: number): Promise<void> {
    /*
        write-lock
    */
    if (expectedMaxSequenceNumber) {
        const currentQueryResult = await this.query(filter);
        if ((currentQueryResult).maxSequenceNumber !== expectedMaxSequenceNumber) {
            throw new Error('eventstore-stores-memory-err05: Context changed: events were modified between query() and append()');
        }
    }

    const eventRecords = this.eventStream.append(events);

    await this.notifier.notify(eventRecords);
  }


  async subscribe(handle: HandleEvents): Promise<EventSubscription> {
    return this.notifier.subscribe(handle);
  }
}