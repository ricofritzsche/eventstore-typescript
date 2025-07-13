export interface HasEventType {
  eventType(): string;
  eventVersion?(): string;
}

export interface EventFilter {
  readonly eventTypes: string[];
  readonly payloadPredicates?: Record<string, unknown>[];
}

export interface QueryResult<T extends HasEventType> {
  events: T[];
  maxSequenceNumber: number;
}

export interface EventStore {
  query<T extends HasEventType>(filter: EventFilter): Promise<QueryResult<T>>;
  append<T extends HasEventType>(filter: EventFilter, events: T[], expectedMaxSequence: number): Promise<void>;
}