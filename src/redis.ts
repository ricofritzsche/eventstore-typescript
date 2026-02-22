// Redis distribution entry point
// Re-exports core functionality plus Redis store

// Export core functionality explicitly to avoid conflicts
export { MemoryEventStore } from './eventstore/stores/memory';
export { MemoryEventStreamNotifier } from './eventstore/notifiers/memory';
export { createFilter, createQuery } from './eventstore/filter';
export * from './eventstore/types';

// Export Redis-specific stores and notifiers
export { RedisEventStore, type RedisEventStoreOptions } from './eventstore/stores/redis';
export { RedisPubSubNotifier, type RedisPubSubNotifierOptions } from './eventstore/notifiers/redis';


