// Postgres distribution entry point
// Re-exports core functionality plus Postgres store

export * from './index'; // Core functionality
export { PostgresEventStore, PostgresEventStoreOptions } from './eventstore/stores/postgres';


