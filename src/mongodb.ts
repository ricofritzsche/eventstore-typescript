// MongoDB distribution entry point
// Re-exports core functionality plus MongoDB store

// Export core functionality explicitly to avoid conflicts
export { MemoryEventStore } from './eventstore/stores/memory';
export { MemoryEventStreamNotifier } from './eventstore/notifiers/memory';
export { createFilter, createQuery } from './eventstore/filter';
export * from './eventstore/types';

// Export MongoDB-specific stores
export { MongoEventStore, type MongoEventStoreOptions } from './eventstore/stores/mongodb/store';


