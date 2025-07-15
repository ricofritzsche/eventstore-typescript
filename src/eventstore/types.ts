export interface Event{
  eventType(): string;
  eventVersion(): string;

  payload(): Record<string, unknown>;
  metadata(): Record<string, unknown>;

  toStructure(): Record<string, unknown> 
}


export class GenericEvent implements Event {
    constructor(
        private _eventType: string,
        private _eventVersion: string = "1.0",
        private _payload: Record<string, unknown>,
        private _metadata: Record<string, unknown> = {},
    ) {}

    eventType(): string {
        return this._eventType;
    }
    eventVersion(): string {
        return this._eventVersion;   
    }
    payload(): Record<string, unknown> {
        return this._payload;
    }
    metadata(): Record<string, unknown> {
        return this._metadata;
    }

    toStructure(): Record<string, unknown> {
        return {
            eventType: this._eventType,
            eventVersion: this._eventVersion,
            payload: this._payload,
            metadata: this._metadata,
        }
    }
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