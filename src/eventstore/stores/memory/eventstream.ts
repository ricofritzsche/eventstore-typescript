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
}