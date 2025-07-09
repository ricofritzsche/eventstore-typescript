export interface IHasEventType {
  eventType(): string;
  eventVersion?(): string;
}

export interface IEventRecord {
  sequenceNumber: number;
  occurredAt: Date;
  eventType: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export interface IEventFilter {
  eventTypes: string[];
  payloadPredicates?: Record<string, unknown>;
  payloadPredicateOptions?: Record<string, unknown>[];
}

export interface IQueryResult<T extends IHasEventType> {
  events: T[];
  maxSequenceNumber: number;
}

export interface IEventStore {
  query<T extends IHasEventType>(filter: IEventFilter): Promise<IQueryResult<T>>;
  append<T extends IHasEventType>(filter: IEventFilter, events: T[], expectedMaxSequence: number): Promise<void>;
}