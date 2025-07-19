import { Event, EventFilter } from '../eventstore/types';
import { HandleEvents, StreamSubscription, EventStreamOptions } from './types';

export function createStreamSubscription(
  id: string,
  filter: EventFilter,
  handle: HandleEvents,
  options: EventStreamOptions,
  unsubscribe: () => Promise<void>
): StreamSubscription {
  return {
    id,
    filter,
    handle,
    options,
    unsubscribe
  };
}

export function matchesFilter(event: Event, filter: EventFilter): boolean {
  if (!filter.eventTypes.includes(event.eventType)) {
    return false;
  }

  if (filter.payloadPredicates && filter.payloadPredicates.length > 0) {
    return filter.payloadPredicates.some(predicate => {
      return Object.entries(predicate).every(([key, value]) => {
        return event.payload[key] === value;
      });
    });
  }

  return true;
}

export function filterEvents(events: Event[], filter: EventFilter): Event[] {
  return events.filter(event => matchesFilter(event, filter));
}

export function generateSubscriptionId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}