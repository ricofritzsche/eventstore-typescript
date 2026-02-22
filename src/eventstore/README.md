# EventStore Module

The EventStore module provides the core functionality for storing and retrieving events from a database, with real-time event subscriptions and pluggable notification systems.

## What it does

**EventStore** is like a specialized database that:
- Stores events (things that happened in your application)
- Retrieves events based on filters
- Ensures events are saved in the correct order
- **Notifies subscribers** when new events are added (real-time updates)
- **Supports multiple projections** running concurrently

## Structure

### Core Files

**`types.ts`** - The basic building blocks:
- `Event` - A single thing that happened (type + data)
- `EventRecord` - An event with sequence number and timestamp
- `EventFilter` - How to search for specific events
- `EventStore` - The main interface for storing/retrieving events
- `EventStreamNotifier` - Interface for pluggable notification systems
- `EventSubscription` - Handle for managing subscriptions
- `HandleEvents` - Function type for event handlers

**`filter.ts`** - Helper to create search filters:
- `createFilter()` - Makes it easy to search for events by type or content

**`index.ts`** - Entry point that exports everything you need

### PostgreSQL Implementation (`stores/postgres/` folder)

**`store.ts`** - The main PostgreSQL implementation:
- `PostgresEventStore` - Saves events to PostgreSQL database
- Handles database connections and transactions
- **Includes subscription support** via configurable notifiers
- **Automatically notifies subscribers** when events are appended

**`schema.ts`** - Database setup:
- Creates the events table
- Sets up indexes for fast searching
- Manages database creation

**`query.ts`** - How to find events:
- Builds SQL queries to search for events
- Handles filtering by event type and content

**`insert.ts`** - How to save events:
- Builds SQL queries to insert new events
- Ensures events are saved in correct order
- **Returns inserted events** for notification

**`transform.ts`** - Data conversion:
- Converts database rows to EventRecord objects
- Prepares events for database storage

### Event Stream Notifiers (`notifiers/` folder)

**`memory/index.ts`** - In-memory notification system:
- `MemoryEventStreamNotifier` - Default notifier implementation
- Manages subscriptions in memory
- **Concurrent event processing** with error isolation
- **Subscription lifecycle management** (subscribe/unsubscribe)

## How it works

1. **Store Events**: Your application creates events and saves them using `append()`
2. **Auto-Notify**: Events are automatically sent to all subscribers via the notifier
3. **Real-time Processing**: Multiple projections can process events concurrently
4. **Retrieve Events**: Your application searches for events using `query()` with filters
5. **Database Storage**: Events are stored in PostgreSQL with sequence numbers and timestamps
6. **Fast Searching**: Database indexes make finding events quick

## Simple Example

```typescript
import { PostgresEventStore } from '@ricofritzsche/eventstore/postgres';
import { createFilter } from '@ricofritzsche/eventstore';

// Create event store with default MemoryEventStreamNotifier
const eventStore = new PostgresEventStore();
await eventStore.initializeDatabase();

// Subscribe to events (real-time processing)
const subscription = await eventStore.subscribe(async (events) => {
  for (const event of events) {
    console.log('New event:', event.eventType, event.payload);
    // Process event for projections, analytics, etc.
  }
});

// Store an event - automatically notifies all subscribers
const event = {
  eventType: 'UserRegistered',
  payload: { userId: '123', email: 'user@example.com' }
};
await eventStore.append([event]);

// Find events
const filter = createFilter(['UserRegistered']);
const result = await eventStore.query(filter);
console.log(result.events); // All UserRegistered events

// Clean up subscription
await subscription.unsubscribe();
await eventStore.close();
```

## Advanced Features

### Custom Notifiers

You can provide your own notifier implementation:

```typescript
import { EventStreamNotifier } from './types';

class DatabaseEventStreamNotifier implements EventStreamNotifier {
  // Your custom implementation
}

const eventStore = new PostgresEventStore({
  notifier: new DatabaseEventStreamNotifier()
});
```

### Multiple Projections

```typescript
// Account projections
const accountSubscription = await eventStore.subscribe(async (events) => {
  for (const event of events) {
    if (event.eventType === 'BankAccountOpened') {
      await updateAccountProjection(event);
    }
  }
});

// Analytics projections  
const analyticsSubscription = await eventStore.subscribe(async (events) => {
  for (const event of events) {
    if (event.eventType === 'BankAccountOpened') {
      await updateAnalytics(event);
    }
  }
});
```

### Projection Rebuilds

Projections can be rebuilt from the complete event history:

```typescript
// Clear existing projection data
await clearProjectionTable();

// Query all relevant events
const filter = createFilter(['BankAccountOpened', 'MoneyDeposited']);
const { events } = await eventStore.query(filter);

// Replay all events to rebuild projections
for (const event of events) {
  await processEventForProjection(event);
}
```

## Key Concepts

- **Events are immutable** - Once stored, they never change
- **Events are ordered** - Each event gets a sequence number
- **Events are filtered** - You can search by type or content
- **Events are atomic** - All events in a batch are saved together or not at all
- **Subscriptions are real-time** - Subscribers are notified immediately when events are appended
- **Notifiers are pluggable** - You can replace the notification system with your own implementation
- **Multiple projections** - Many subscribers can process the same events concurrently
- **Error isolation** - If one subscriber fails, others continue processing
- **Sequence tracking** - Events include sequence numbers for debugging and consistency

## Banking Example

The banking example demonstrates practical usage:
- **Account projections** - Real-time account balance updates
- **Analytics projections** - Monthly account opening statistics  
- **CLI interface** - Interactive banking operations with live updates
- **Rebuild functionality** - Projection recovery from event history
- **Concurrent processing** - Both projections update simultaneously from the same events