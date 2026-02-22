# Package Distributions

This package provides multiple entry points to support different database backends while keeping dependencies minimal.

## Entry Points

### Core (`@ricofritzsche/eventstore`)

The core package exports types, filters, notifiers, and the in-memory store. **No database dependencies required.**

```typescript
import { 
  MemoryEventStore,
  MemoryEventStreamNotifier,
  createFilter,
  createQuery,
  Event,
  EventRecord,
  EventStore
} from '@ricofritzsche/eventstore';
```

### Postgres Distribution (`@ricofritzsche/eventstore/postgres`)

The Postgres distribution includes all core functionality plus the Postgres store. **Requires `pg` package.**

```typescript
import { 
  PostgresEventStore,
  PostgresEventStoreOptions,
  // ... all core exports
} from '@ricofritzsche/eventstore/postgres';
```

**Installation:**
```bash
npm install @ricofritzsche/eventstore pg
# or
bun add @ricofritzsche/eventstore pg
```

### MongoDB Distribution (`@ricofritzsche/eventstore/mongodb`)

The MongoDB distribution includes all core functionality plus the MongoDB store. **Requires `mongodb` package.**

```typescript
import { 
  MongoEventStore,
  MongoEventStoreOptions,
  // ... all core exports
} from '@ricofritzsche/eventstore/mongodb';
```

**Installation:**
```bash
npm install @ricofritzsche/eventstore mongodb
# or
bun add @ricofritzsche/eventstore mongodb
```

### Redis Distribution (`@ricofritzsche/eventstore/redis`)

The Redis distribution includes all core functionality plus the Redis store. **Requires `redis` package.**

```typescript
import { 
  RedisEventStore,
  RedisEventStoreOptions,
  // ... all core exports
} from '@ricofritzsche/eventstore/redis';
```

**Installation:**
```bash
npm install @ricofritzsche/eventstore redis
# or
bun add @ricofritzsche/eventstore redis
```

## Usage Examples

### Using Postgres Backend

```typescript
import { PostgresEventStore, createFilter } from '@ricofritzsche/eventstore/postgres';

const eventStore = new PostgresEventStore({
  connectionString: process.env.DATABASE_URL
});

await eventStore.initializeDatabase();

// Use the store...
await eventStore.append([{
  eventType: 'UserRegistered',
  payload: { userId: '123', email: 'user@example.com' }
}]);

const result = await eventStore.query(createFilter(['UserRegistered']));
console.log(result.events);
```

### Using MongoDB Backend

```typescript
import { MongoEventStore, createFilter } from '@ricofritzsche/eventstore/mongodb';

const eventStore = new MongoEventStore({
  connectionString: process.env.MONGODB_URL,
  databaseName: 'myapp'
});

await eventStore.initializeDatabase();

// Use the store...
await eventStore.append([{
  eventType: 'UserRegistered',
  payload: { userId: '123', email: 'user@example.com' }
}]);

const result = await eventStore.query(createFilter(['UserRegistered']));
console.log(result.events);
```

### Using Redis Backend

```typescript
import { RedisEventStore, createFilter } from '@ricofritzsche/eventstore/redis';

const eventStore = new RedisEventStore({
  connectionString: process.env.REDIS_URL,
  database: 0 // Optional, defaults to 0
});

await eventStore.initializeDatabase();

// Use the store...
await eventStore.append([{
  eventType: 'UserRegistered',
  payload: { userId: '123', email: 'user@example.com' }
}]);

const result = await eventStore.query(createFilter(['UserRegistered']));
console.log(result.events);
```

### Using In-Memory Store (No Database Required)

```typescript
import { MemoryEventStore, createFilter } from '@ricofritzsche/eventstore';

const eventStore = new MemoryEventStore();

// Use the store...
await eventStore.append([{
  eventType: 'UserRegistered',
  payload: { userId: '123', email: 'user@example.com' }
}]);

const result = await eventStore.query(createFilter(['UserRegistered']));
console.log(result.events);
```

## Benefits

- **Smaller dependency trees**: Only install the database driver you need
- **Type safety**: Each distribution exports only what's available for that backend
- **Flexibility**: Switch backends by changing the import path
- **Backward compatibility**: Core package remains available for in-memory usage

## Migration Guide

If you're currently using the default export:

**Before:**
```typescript
import { PostgresEventStore } from '@ricofritzsche/eventstore';
```

**After:**
```typescript
import { PostgresEventStore } from '@ricofritzsche/eventstore/postgres';
```

Make sure to install the required peer dependency:
```bash
npm install pg
```

