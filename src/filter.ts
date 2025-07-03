import { EventFilter as IEventFilter } from './types';

export class EventFilter implements IEventFilter {
  public readonly eventTypes: string[];
  public readonly payloadPredicates?: Record<string, unknown>;

  constructor(eventTypes: string[], payloadPredicates?: Record<string, unknown>) {
    this.eventTypes = eventTypes;
    if (payloadPredicates !== undefined) {
      this.payloadPredicates = payloadPredicates;
    }
  }

  static new(eventTypes: string[]): EventFilter {
    return new EventFilter(eventTypes);
  }

  withPayloadPredicate(key: string, value: unknown): EventFilter {
    const predicates = { ...this.payloadPredicates, [key]: value };
    return new EventFilter(this.eventTypes, predicates);
  }

  withPayloadPredicates(predicates: Record<string, unknown>): EventFilter {
    const mergedPredicates = { ...this.payloadPredicates, ...predicates };
    return new EventFilter(this.eventTypes, mergedPredicates);
  }
}