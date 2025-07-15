export interface Event{
  eventType(): string;
  eventVersion(): string;

  payload(): Record<string, unknown>;
  metadata(): Record<string, unknown>;
}

export interface EventRecord extends Event {
  sequenceNumber(): number;
  timestamp(): Date;
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
  append(events: Event[], filter: EventFilter,  expectedMaxSequenceNumber: number): Promise<void>;
}