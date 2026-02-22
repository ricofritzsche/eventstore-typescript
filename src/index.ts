// Core entry point - no database dependencies
// Exports: types, filters, notifiers, and memory store only

export { MemoryEventStore } from './eventstore/stores/memory';
export { MemoryEventStreamNotifier } from './eventstore/notifiers/memory';
export { createFilter, createQuery } from './eventstore/filter';
export * from './eventstore/types';
