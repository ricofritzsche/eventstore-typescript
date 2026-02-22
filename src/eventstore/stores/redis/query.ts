import { EventFilter, EventQuery } from '../../types';

/**
 * Checks if an event document matches the filter criteria
 */
export function matchesFilter(doc: { event_type: string; payload: Record<string, unknown> }, filter: EventFilter): boolean {
  // Check event types
  if (filter.eventTypes && filter.eventTypes.length > 0) {
    if (!filter.eventTypes.includes(doc.event_type)) {
      return false;
    }
  }

  // Check payload predicates
  if (filter.payloadPredicates && filter.payloadPredicates.length > 0) {
    // At least one predicate must match (OR)
    const predicateMatches = filter.payloadPredicates.some((predicate) => {
      // All key-value pairs in the predicate must exist in payload (AND)
      return Object.entries(predicate).every(([key, value]) => {
        // Use deep equality check for nested objects
        return deepEqual(doc.payload[key], value);
      });
    });

    if (!predicateMatches) {
      return false;
    }
  }

  return true;
}

/**
 * Deep equality check for objects
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;

  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}

/**
 * Compiles EventQuery into a filter function for client-side filtering
 * Since Redis doesn't support complex JSON queries natively, we'll fetch all events
 * and filter client-side (or use RedisJSON if available)
 */
export function compileQueryFilter(query: EventQuery): (doc: { event_type: string; payload: Record<string, unknown> }) => boolean {
  if (!query.filters || query.filters.length === 0) {
    return () => true; // No filter, match all
  }

  // Multiple filters are ORed together
  return (doc) => {
    return query.filters.some((filter) => matchesFilter(doc, filter));
  };
}

/**
 * Gets event type keys to query based on EventQuery
 * Returns array of event types to query, or null if all types should be queried
 */
export function getEventTypesToQuery(query: EventQuery): string[] | null {
  if (!query.filters || query.filters.length === 0) {
    return null; // Query all event types
  }

  // Collect all unique event types from all filters
  const eventTypes = new Set<string>();
  for (const filter of query.filters) {
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      for (const eventType of filter.eventTypes) {
        eventTypes.add(eventType);
      }
    }
  }

  return eventTypes.size > 0 ? Array.from(eventTypes) : null;
}

