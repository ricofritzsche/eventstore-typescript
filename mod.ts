// Deno entry point with explicit .ts extensions
// Universal PostgreSQL support for both Node.js and Deno
export { PostgresEventStore } from './src/eventstore/stores/postgres/store_deno.ts';
export type { PostgresEventStoreOptions } from './src/eventstore/stores/postgres/store_deno.ts';
export { MemoryEventStreamNotifier } from './src/eventstore/notifiers/memory/mod.ts';
export { createFilter } from './src/eventstore/filter_deno.ts';
export * from './src/eventstore/types.ts';