import { EventFilter, EventRecord } from '../../types';

export function processQuery(events: EventRecord[], filter?: EventFilter):EventRecord[] {
    if (!filter) {
        return events;
    }
    return events.filter((e) => checkEvent(e, filter));
}


function checkEvent(event:EventRecord, filter:EventFilter):boolean {
    return checkEventTypes(event.eventType, filter.eventTypes) && 
        checkPredicates(event.payload, filter.payloadPredicates);
}

function checkEventTypes(eventType:string, eventTypes?:string[]):boolean {
    if (eventTypes && eventTypes.length > 0) {
        return eventTypes.includes(eventType);
    }
    return true;
}

function checkPredicates(payload:Record<string,unknown>, predicates?:Record<string, unknown>[]):boolean {
    if (predicates && predicates.length > 0) {
        return predicates.some((predicate) => isPredicateASubsetOfPayload(payload, predicate));
    }
    return true;
}

function isPredicateASubsetOfPayload(payload: unknown, predicate: unknown): boolean {
    if (predicate === null || predicate === undefined) {
        return true;
    }
    
    if (payload === null || payload === undefined) {
        return false;
    }

    if (typeof predicate !== 'object' || typeof payload !== 'object') {
        return predicate === payload;
    }

    if (Array.isArray(predicate) && Array.isArray(payload)) {
        return predicate.every(subItem => 
            payload.some(superItem => isPredicateASubsetOfPayload(subItem, superItem))
        );
    }
    if (Array.isArray(predicate) !== Array.isArray(payload)) {
        return false;
    }

    const subsetObj = predicate as Record<string, unknown>;
    const supersetObj = payload as Record<string, unknown>;
    
    for (const key in subsetObj) {
        if (!(key in supersetObj)) {
            return false;
        }
        if (!isPredicateASubsetOfPayload(subsetObj[key], supersetObj[key])) {
            return false;
        }
    }
    
    return true;
}