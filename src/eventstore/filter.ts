import { IEventFilter } from "./types"

export class EventFilter implements IEventFilter {
  public readonly eventTypes: string[];
  public readonly payloadPredicates?: Record<string, unknown>;
  public readonly payloadPredicateOptions?: Record<string, unknown>[];


  // Methods for initial construction of a filter
  protected constructor(eventTypes: string[], payloadPredicates?: Record<string, unknown>, payloadPredicateOptions?: Record<string, unknown>[]) {
    this.eventTypes = eventTypes;
    if (payloadPredicates !== undefined) {
      this.payloadPredicates = payloadPredicates;
    }
    if (payloadPredicateOptions !== undefined) {
      this.payloadPredicateOptions = payloadPredicateOptions;
    }
  }

  static fromEventTypesOnly(eventTypes: string[]): EventFilter {
    return new EventFilter(eventTypes);
  }

  static fromPayloadPredicateOptions(eventTypes: string[], payloadPredicateOptions?: Record<string, unknown>[]): EventFilter {
    return new EventFilter(eventTypes, undefined, payloadPredicateOptions);
  }


  // Fluent interface methods to extend a filter
  withPayloadPredicate(key: string, value: unknown): EventFilter {
    const mergedPredicates = { ...this.payloadPredicates, [key]: value };
    return new EventFilter(this.eventTypes, mergedPredicates, this.payloadPredicateOptions);
  }

  withPayloadPredicates(predicates: Record<string, unknown>[]): EventFilter {
    const combinedPredicates = Object.assign({}, ...predicates);
    const mergedPredicates = { ...this.payloadPredicates, ...combinedPredicates };
    return new EventFilter(this.eventTypes, mergedPredicates, this.payloadPredicateOptions);
  }
}