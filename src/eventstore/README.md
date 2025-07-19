# EventStore Module

The EventStore module provides the core functionality for storing and retrieving events from a database.

## What it does

**EventStore** is like a specialized database that:
- Stores events (things that happened in your application)
- Retrieves events based on filters
- Ensures events are saved in the correct order

## Structure

### Core Files

**`types.ts`** - The basic building blocks:
- `Event` - A single thing that happened (type + data)
- `EventRecord` - An event with sequence number and timestamp
- `EventFilter` - How to search for specific events
- `EventStore` - The main interface for storing/retrieving events

**`filter.ts`** - Helper to create search filters:
- `createFilter()` - Makes it easy to search for events by type or content

**`index.ts`** - Entry point that exports everything you need

### PostgreSQL Implementation (`postgres/` folder)

**`store.ts`** - The main PostgreSQL implementation:
- `PostgresEventStore` - Saves events to PostgreSQL database
- Handles database connections and transactions

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

**`transform.ts`** - Data conversion:
- Converts database rows to Event objects
- Prepares events for database storage

## How it works

1. **Store Events**: Your application creates events and saves them using `append()`
2. **Auto-Dispatch**: Events are automatically sent to connected EventStream (if configured)
3. **Retrieve Events**: Your application searches for events using `query()` with filters
4. **Database Storage**: Events are stored in PostgreSQL with sequence numbers and timestamps
5. **Fast Searching**: Database indexes make finding events quick

## Simple Example

```typescript
import { PostgresEventStore, createFilter } from './eventstore';
import { MemoryEventStream } from '../eventstream';

// Create event stream and connect to event store
const eventStream = new MemoryEventStream();
const eventStore = new PostgresEventStore({ eventStream });

// Store an event - automatically dispatches to event stream
const event = {
  eventType: 'UserRegistered',
  payload: { userId: '123', email: 'user@example.com' }
};
await eventStore.append([event]);

// Find events
const filter = createFilter(['UserRegistered']);
const result = await eventStore.query(filter);
console.log(result.events); // All UserRegistered events
```

## Key Concepts

- **Events are immutable** - Once stored, they never change
- **Events are ordered** - Each event gets a sequence number
- **Events are filtered** - You can search by type or content
- **Events are atomic** - All events in a batch are saved together or not at all