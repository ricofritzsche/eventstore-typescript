# EventStore TypeScript

A TypeScript implementation of a functional event sourcing system that provides persistent event storage with optimistic locking and payload-based querying. This follows the functional core/imperative shell pattern where business logic is kept pure and side effects are isolated to the storage layer.

## Core Philosophy

This EventStore is designed around the principle of **aggregateless event sourcing**, where events are the primary source of truth and state is derived through pure fold functions. Instead of traditional aggregates, we use:

- **Events as first-class citizens** - Immutable facts that represent domain changes
- **Pure fold functions** - Deterministic state reconstruction from events  
- **Optimistic locking** - Consistency through context-aware operations
- **Cross-slice event consumption** - Bounded contexts can consume each other's events

## Key Features

### Functional Core Pattern
Business logic is implemented as pure functions that are easy to test and reason about:

```typescript
// Pure functions - no side effects
function foldAssetState(events: AssetRegistered[]): AssetState {
  return { exists: events.length > 0 };
}

function decideAssetRegistration(
  state: AssetState, 
  assetId: string, 
  name: string
): AssetRegistered[] {
  if (state.exists) {
    throw new Error('AssetAlreadyExists');
  }
  return [new AssetRegisteredEvent(assetId, name)];
}
```

### Optimistic Locking
Ensures consistency without traditional database locks by validating context hasn't changed:

```typescript
// Query with specific context
const filter = EventStore
  .createFilter(['AssetRegistered'])
  .withPayloadPredicate('name', assetName);

const events = await store.queryEvents<AssetRegistered>(filter);
const state = foldAssetState(events);
const newEvents = decideAssetRegistration(state, assetId, assetName);

// Append with same filter - fails if context changed
await store.append(filter, newEvents);
```

### Payload-Based Querying
Precise event filtering using JSONB containment operators:

```typescript
// Filter by event types and payload content
const filter = EventStore
  .createFilter(['AssetRegistered', 'DeviceRegistered'])
  .withPayloadPredicate('organizationId', 'org-123')
  .withPayloadPredicate('status', 'active');
```

## Architecture

### Core Interfaces

```typescript
// Events must implement this interface
interface HasEventType {
  eventType(): string;
  eventVersion?(): string;
}

// Main EventStore interface  
interface IEventStore {
  queryEvents<T extends HasEventType>(filter: EventFilter): Promise<T[]>;
  append<T extends HasEventType>(filter: EventFilter, events: T[]): Promise<void>;
}
```

### PostgreSQL Schema

```sql
CREATE TABLE events (
  sequence_number BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'
);

-- Optimized indexes for querying
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_occurred_at ON events(occurred_at);
CREATE INDEX idx_events_payload_gin ON events USING gin(payload);
```

### Optimistic Locking Implementation

The append operation uses a CTE (Common Table Expression) to ensure atomicity and prevent race conditions:

```sql
WITH context AS (
  SELECT MAX(sequence_number) AS max_seq
  FROM events 
  WHERE event_type = ANY($1) AND payload @> $2
)
INSERT INTO events (event_type, payload, metadata)
SELECT unnest($4::text[]), unnest($5::jsonb[]), unnest($6::jsonb[])
FROM context
WHERE COALESCE(max_seq, 0) = $3
```

This ensures that:
- Context validation and event insertion happen atomically
- No events can be inserted if the context has changed
- Multiple events can be inserted efficiently in a single operation
- Race conditions between concurrent operations are prevented

## Getting Started

### Installation

```bash
npm install
```

### Database Setup

1. **Start PostgreSQL** (Docker example):
```bash
docker run --name eventstore-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=eventstore -p 5432:5432 -d postgres:15
```

2. **Set connection string** (optional):
```bash
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/eventstore"
```

### Basic Usage

```typescript
import { EventStore, HasEventType } from './src';

// 1. Define your events
class AssetRegistered implements HasEventType {
  constructor(
    public readonly assetId: string,
    public readonly name: string,
    public readonly occurredAt: Date = new Date()
  ) {}

  eventType(): string {
    return 'AssetRegistered';
  }
}

// 2. Create EventStore and migrate
const store = new EventStore();
await store.migrate();

// 3. Store events with context
const filter = EventStore
  .createFilter(['AssetRegistered'])
  .withPayloadPredicate('name', 'MyAsset');

const events = [new AssetRegistered('asset-123', 'MyAsset')];
await store.append(filter, events);

// 4. Query events
const storedEvents = await store.queryEvents<AssetRegistered>(filter);
```

### Running the Example

```bash
npm run example
```

This demonstrates:
- Basic event storage and retrieval
- Optimistic locking preventing duplicate asset names
- Cross-slice event consumption for device binding

## Usage Patterns

### 1. Command Handler Pattern

```typescript
async function executeAssetRegistration(
  store: EventStore,
  assetId: string,
  name: string
): Promise<void> {
  // Query current state
  const filter = EventStore
    .createFilter(['AssetRegistered'])
    .withPayloadPredicate('name', name);
  
  const events = await store.queryEvents<AssetRegistered>(filter);
  
  // Pure business logic
  const state = foldAssetState(events);
  const newEvents = decideAssetRegistration(state, assetId, name);
  
  // Persist with optimistic locking
  await store.append(filter, newEvents);
}
```

### 2. Event Projections

```typescript
// Build read models from events
async function buildAssetProjection(store: EventStore): Promise<AssetView[]> {
  const filter = EventStore.createFilter(['AssetRegistered', 'AssetUpdated']);
  const events = await store.queryEvents(filter);
  
  return events.reduce((projection, event) => {
    // Apply event to projection
    return applyEventToProjection(projection, event);
  }, []);
}
```

## Testing Strategy

### Unit Tests (Pure Functions)
```typescript
describe('Asset Registration Logic', () => {
  it('should allow registration of new asset', () => {
    const state = { exists: false };
    const events = decideAssetRegistration(state, 'asset-1', 'Test Asset');
    
    expect(events).toHaveLength(1);
    expect(events[0].assetId).toBe('asset-1');
  });

  it('should reject duplicate asset names', () => {
    const state = { exists: true };
    
    expect(() => decideAssetRegistration(state, 'asset-1', 'Test Asset'))
      .toThrow('AssetAlreadyExists');
  });
});
```

### Integration Tests
```typescript
describe('EventStore Integration', () => {
  it('should enforce optimistic locking', async () => {
    const store = new EventStore();
    
    // First registration succeeds
    await executeAssetRegistration(store, 'asset-1', 'Test Asset');
    
    // Second registration with same name fails
    await expect(executeAssetRegistration(store, 'asset-2', 'Test Asset'))
      .rejects.toThrow('AssetAlreadyExists');
  });
});
```

## Configuration

### Environment Variables

- `DATABASE_URL` - PostgreSQL connection string
- Default: `"postgres://postgres:postgres@localhost:5432/eventstore"`

### TypeScript Configuration

Requires `exactOptionalPropertyTypes: true` for proper type safety with optional properties.

## Performance Considerations

- **Indexing**: JSONB GIN indexes enable fast payload queries
- **Batching**: Use bulk operations for high-throughput scenarios
- **Partitioning**: Consider table partitioning for very large event stores
- **Connection Pooling**: Uses pg connection pooling by default

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details