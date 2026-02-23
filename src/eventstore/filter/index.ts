import { EventFilter, EventQuery, QueryOptions } from '../types';

export function createFilter(
  eventTypes: string[],
  payloadPredicates?: Record<string, unknown>[]
): EventFilter {
  return {
    eventTypes,
    ...(payloadPredicates && { payloadPredicates })
  };
}

export function createQuery(...filters: EventFilter[]): EventQuery;
export function createQuery(options: QueryOptions, ...filters: EventFilter[]): EventQuery;
export function createQuery(...args: (QueryOptions | EventFilter)[]): EventQuery {
  if (args.length === 0) return { filters: [] };
  const first = args[0]!;
  if (!('eventTypes' in first)) {
    return { filters: args.slice(1) as EventFilter[], options: first as QueryOptions };
  }
  return { filters: args as EventFilter[] };
}