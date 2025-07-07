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
}

export interface IEventStore {
  query<T extends HasEventType>(filter: EventFilter): Promise<T[]>;
  append<T extends HasEventType>(filter: EventFilter, events: T[]): Promise<void>;
}

export interface EventStoreOptions {
  connectionString?: string;
}