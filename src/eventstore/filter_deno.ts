/**
 * @fileoverview Event filter creation utilities for Deno
 * 
 * This module provides utility functions for creating EventFilter objects used to query
 * event stores. Filters allow you to specify which event types and payload conditions
 * should match when retrieving events from the store.
 * 
 * @example
 * ```typescript
 * import { createFilter } from 'jsr:@ricofritzsche/eventstore/filter';
 * 
 * // Filter by event types only
 * const typeFilter = createFilter(['UserCreated', 'UserUpdated']);
 * 
 * // Filter by event types and payload conditions
 * const complexFilter = createFilter(
 *   ['UserCreated'], 
 *   [{ department: 'engineering' }, { role: 'admin' }]
 * );
 * ```
 * 
 * @module
 */

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