/**
 * @fileoverview Universal TypeScript event sourcing library for Deno and Node.js
 * 
 * This module provides a complete event sourcing solution with PostgreSQL persistence,
 * real-time subscriptions, and projection support. It automatically detects the runtime
 * environment (Deno or Node.js) and uses the appropriate PostgreSQL driver.
 * 
 * @example
 * ```typescript
 * import { PostgresEventStore, createFilter } from 'jsr:@ricofritzsche/eventstore';
 * 
 * const store = new PostgresEventStore({ 
 *   connectionString: 'postgres://user:pass@localhost/db' 
 * });
 * 
 * await store.initializeDatabase();
 * 
 * const filter = createFilter(['UserCreated']);
 * const events = await store.query(filter);
 * ```
 * 
 * @module
 */

// Universal PostgreSQL support for both Node.js and Deno
export { PostgresEventStore } from './src/eventstore/stores/postgres_deno/store.ts';
export type { PostgresEventStoreOptions } from './src/eventstore/stores/postgres_deno/store.ts';
export { MemoryEventStreamNotifier } from './src/eventstore/notifiers/memory/mod.ts';
export { createFilter } from './src/eventstore/filter/mod.ts';
export * from './src/eventstore/types.ts';