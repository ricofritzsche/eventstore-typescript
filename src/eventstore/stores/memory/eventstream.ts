import { Event, EventRecord } from '../../types';


export class EventStream {
    public readonly eventRecords: EventRecord[] = [];
    private lastSequenceNumber:number = 0;

    append(events: Event[]): EventRecord[] {
        const eventRecords = events.map((e) => {
            return {
                sequenceNumber: ++this.lastSequenceNumber,
                timestamp: new Date(),
                eventType: e.eventType,
                payload: e.payload
            }
        })
        this.eventRecords.push(...eventRecords);
        return eventRecords;
    }

    serialize(): string {
        const serializedRecords = this.eventRecords.map(record => ({
            ...record,
            timestamp: record.timestamp.toISOString()
        }));
        return JSON.stringify({
            eventRecords: serializedRecords,
            lastSequenceNumber: this.lastSequenceNumber
        });
    }

    static deserialize(serialized: string): EventStream {
        const obj = JSON.parse(serialized);
        const eventStream = new EventStream();
        eventStream.lastSequenceNumber = obj.lastSequenceNumber;
        eventStream.eventRecords.push(...obj.eventRecords.map((record: any) => ({
            ...record,
            timestamp: new Date(record.timestamp)
        })));
        return eventStream;
    }
}
