export interface HasEventType {
  eventType(): string;
  eventVersion?(): string;
}

export interface EventRecord {
  sequenceNumber: number;
  occurredAt: Date;
  eventType: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface EventFilter {
  eventTypes: string[];
  payloadPredicates?: Record<string, unknown>;
  payloadPredicateOptions?: Record<string, unknown>[];
}

export interface QueryResult<T extends HasEventType> {
  events: T[];
  maxSequenceNumber: number;
}

export interface IEventStore {
  query<T extends HasEventType>(filter: EventFilter): Promise<QueryResult<T>>;
  append<T extends HasEventType>(filter: EventFilter, events: T[], expectedMaxSequence: number): Promise<void>;
  close(): Promise<void>;
}

export interface EventStoreOptions {
  connectionString?: string;
}