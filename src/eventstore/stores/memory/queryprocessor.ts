import { Event, EventFilter, EventRecord } from '../../types';

export function processQuery(events: EventRecord[], filter?: EventFilter):EventRecord[] {
    if (!filter) {
        return events;
    }
    return events.filter((e) => check(e, filter));
}

function check(event:Event, filter:EventFilter):boolean {
    return true;
}