import { EventFilter } from './types.ts';

export function createFilter(
  eventTypes: string[],
  payloadPredicates?: Record<string, unknown>[]
): EventFilter {
  return {
    eventTypes,
    ...(payloadPredicates && { payloadPredicates })
  };
}