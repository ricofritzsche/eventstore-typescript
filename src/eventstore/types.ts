export interface Event{
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

export interface EventRecord extends Event {
  readonly sequenceNumber: number;
  readonly timestamp: Date;
}

export interface EventFilter {
  readonly eventTypes: string[];
  readonly payloadPredicates?: Record<string, unknown>[];
}

export interface QueryResult {
  events: EventRecord[];
  maxSequenceNumber: number;
}

export interface EventStore {
  query(filter: EventFilter): Promise<QueryResult>;
  append(events: Event[], filter?: EventFilter,  expectedMaxSequenceNumber?: number): Promise<void>;
}
