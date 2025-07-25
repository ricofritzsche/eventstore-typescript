/**
 * @fileoverview Filter utilities for Deno runtime
 * 
 * This module provides filter creation utilities for event querying in Deno.
 * 
 * @module
 */

// @ts-ignore
import { EventFilter } from '../types.ts';

export function createFilter(
  eventTypes: string[],
  payloadPredicates?: Record<string, unknown>[]
): EventFilter {
  return {
    eventTypes,
    ...(payloadPredicates && { payloadPredicates })
  };
}