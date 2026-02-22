import { EventFilter, EventQuery } from '../../types';
import { Filter, Document } from 'mongodb';

/**
 * Compiles EventFilter conditions into MongoDB filter
 *
 * PostgreSQL's `payload @> predicate` (JSONB contains) is equivalent to checking
 * if all key-value pairs in the predicate exist in the payload.
 * In MongoDB, we construct conditions using dot notation for each field.
 */
export function compileFilterConditions(
  filter: EventFilter,
  paramsBaseIndex: number
): Filter<Document> {
  const conditions: Filter<Document>[] = [];

  // Handle event types (OR condition)
  if (filter.eventTypes && filter.eventTypes.length > 0) {
    conditions.push({ event_type: { $in: filter.eventTypes } });
  }

  // Handle payload predicates
  // Each predicate is an object with key-value pairs that should exist in payload
  // Multiple predicates are ORed together
  // Within each predicate, all key-value pairs are ANDed together
  if (filter.payloadPredicates && filter.payloadPredicates.length > 0) {
    const payloadConditions = filter.payloadPredicates
      .map((predicate) => {
        // Build conditions for each key-value pair in the predicate
        const predicateConditions: Filter<Document>[] = [];

        for (const [key, value] of Object.entries(predicate)) {
          // Use dot notation to check if payload contains this key-value pair
          // This is MongoDB's equivalent to PostgreSQL's `payload @> { key: value }`
          const payloadPath = `payload.${key}`;
          predicateConditions.push({ [payloadPath]: value } as Filter<Document>);
        }

        // All conditions in a predicate are ANDed together
        if (predicateConditions.length === 1) {
          return predicateConditions[0];
        }
        if (predicateConditions.length > 1) {
          return { $and: predicateConditions };
        }
        return {};
      })
      .filter(
        (cond): cond is Filter<Document> => cond !== undefined && Object.keys(cond).length > 0
      );

    // Multiple predicates are ORed together
    if (payloadConditions.length === 1) {
      const condition = payloadConditions[0];
      if (condition !== undefined) {
        conditions.push(condition);
      }
    } else if (payloadConditions.length > 1) {
      conditions.push({ $or: payloadConditions });
    }
  }

  // Combine all conditions with AND (event types AND payload predicates)
  if (conditions.length === 0) {
    return {};
  }
  if (conditions.length === 1) {
    const condition = conditions[0];
    return condition ?? {};
  }
  return { $and: conditions };
}

/**
 * Compiles EventQuery into MongoDB filter
 * Multiple filters in EventQuery are ORed together
 */
export function compileQueryConditions(query: EventQuery): Filter<Document> {
  if (!query.filters || query.filters.length === 0) {
    return {};
  }

  if (query.filters.length === 1) {
    const firstFilter = query.filters[0];
    if (!firstFilter) {
      return {};
    }
    return compileFilterConditions(firstFilter, 0);
  }

  // Multiple filters are ORed together
  const orConditions = query.filters
    .filter((filter): filter is EventFilter => filter !== undefined)
    .map((filter) => compileFilterConditions(filter, 0));

  if (orConditions.length === 0) {
    return {};
  }
  if (orConditions.length === 1) {
    const condition = orConditions[0];
    return condition ?? {};
  }
  return { $or: orConditions };
}

/**
 * Builds a MongoDB query for finding events
 */
export function buildQuery(query: EventQuery): { filter: Filter<Document>; sort: Document } {
  const filter = compileQueryConditions(query);

  return {
    filter,
    sort: { sequence_number: 1 }, // Sort by sequence number ascending
  };
}

/**
 * Builds a MongoDB query for optimistic locking append operation
 * Returns filter to find max sequence number and verify it matches expected
 */
export function buildAppendQuery(
  query: EventQuery,
  expectedMaxSeq: number
): { filter: Filter<Document>; maxSeqFilter: Filter<Document> } {
  const contextFilter = compileQueryConditions(query);

  // Filter to find the max sequence number matching the context
  // This is the same as the context filter since we'll query for max sequence
  const maxSeqFilter: Filter<Document> = {
    ...contextFilter,
  };

  return {
    filter: contextFilter,
    maxSeqFilter,
  };
}
