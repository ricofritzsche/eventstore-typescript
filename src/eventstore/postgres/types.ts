import { Event, EventRecord } from "../types";


export class PostgresEvent implements Event {
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


export class PostgresEventRecord implements EventRecord {
    constructor(
        private _sequenceNumber: number,
        private _timestamp: Date = new Date(),

        private _eventType: string,
        private _eventVersion: string = "1.0",
        private _payload: Record<string, unknown>,
        private _metadata: Record<string, unknown> = {},
    ) {}

    sequenceNumber(): number {
        return this._sequenceNumber;
    }
    
    timestamp(): Date {
        return this._timestamp;
    }

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
            sequenceNumber: this._sequenceNumber,
            timestamp: this._timestamp,

            eventType: this._eventType,
            eventVersion: this._eventVersion,
            payload: this._payload,
            metadata: this._metadata,
        }
    }
}