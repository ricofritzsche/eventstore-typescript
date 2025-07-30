import { EventFilter, EventQuery, EventRecord } from '../../types';

export function processQuery(events: EventRecord[], query?: EventQuery):EventRecord[] {
    if (!query) {
        return events;
    }
    return events.filter((e) => checkEventAgainstQuery(e, query));
}

function checkEventAgainstQuery(event:EventRecord, query:EventQuery):boolean {
    return query.filters.some((filter) => checkEventAgainstFilter(event, filter));
}

function checkEventAgainstFilter(event:EventRecord, filter:EventFilter):boolean {
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
        return predicate.every(predicateElement => 
            payload.some(payloadElement => isPredicateASubsetOfPayload(payloadElement, predicateElement))
        );
    }
    if (Array.isArray(predicate) !== Array.isArray(payload)) {
        return false;
    }
    
    // compare objects recursively
    const predicateKeys = predicate as Record<string, unknown>;
    const payloadKeys = payload as Record<string, unknown>;
    
    for (const predicateKey in predicateKeys) {
        if (!(predicateKey in payloadKeys)) {
            return false;
        }
        if (!isPredicateASubsetOfPayload(payloadKeys[predicateKey], predicateKeys[predicateKey])) {
            return false;
        }
    }
    
    return true;
}