# EventStore TypeScript

A comprehensive TypeScript implementation of event sourcing with real-time event streaming and projections. This system provides persistent event storage with automatic notification to event streams for building responsive, event-driven applications.

## High-Level Architecture

The system is built around two core concepts that work together:

### 🏪 **EventStore** - The Source of Truth
- **Persistent Storage**: Events are immutably stored in PostgreSQL
- **Query Engine**: Fast retrieval with filtering and payload-based queries
- **Optimistic Locking**: Ensures consistency without traditional database locks
- **Auto-Notification**: Automatically dispatches events to connected streams

### 🌊 **EventStream** - The Notification System  
- **Real-time Processing**: Events flow immediately to interested subscribers
- **Projection System**: Automatically updates read models (database views)
- **Configurable Filtering**: Subscribers only receive events they care about
- **Batched Processing**: Handles high-volume scenarios efficiently

## System Flow

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Application   │    │   EventStore    │    │   EventStream   │
│                 │    │                 │    │                 │
│  ┌──────────┐   │    │  ┌──────────┐   │    │  ┌──────────┐   │
│  │Commands  │ ──┼───▶│  │PostgreSQL│   │    │  │Subscribers│   │
│  │          │   │    │  │Database  │   │    │  │           │   │
│  └──────────┘   │    │  └──────────┘   │    │  └──────────┘   │
│                 │    │       │         │    │       ▲         │
│  ┌──────────┐   │    │       │         │    │       │         │
│  │Queries   │ ◀─┼────│       │         │    │       │         │
│  │          │   │    │       │         │    │       │         │
│  └──────────┘   │    │       ▼         │    │       │         │
│                 │    │  ┌──────────┐   │    │  ┌──────────┐   │
└─────────────────┘    │  │Auto-     │ ──┼───▶│  │Event     │   │
                       │  │Dispatch  │   │    │  │Filtering │   │
                       │  └──────────┘   │    │  └──────────┘   │
                       └─────────────────┘    └─────────────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │   Projections   │
                                              │                 │
                                              │  ┌──────────┐   │
                                              │  │Accounts  │   │
                                              │  │Table     │   │
                                              │  └──────────┘   │
                                              │  ┌──────────┐   │
                                              │  │Users     │   │
                                              │  │Table     │   │
                                              │  └──────────┘   │
                                              │  ┌──────────┐   │
                                              │  │Other     │   │
                                              │  │Views     │   │
                                              │  └──────────┘   │
                                              └─────────────────┘

1. Application sends commands to EventStore
2. EventStore saves events to PostgreSQL
3. EventStore automatically dispatches events to EventStream
4. EventStream filters and sends events to subscribers
5. Subscribers (projections) update their read models
6. Application queries both EventStore and projections
```

## Core Modules

### 📦 **EventStore Module** (`src/eventstore/`)

**Purpose**: Persistent event storage and retrieval

**Key Components**:
- **`types.ts`** - Core interfaces (Event, EventFilter, EventStore)
- **`postgres/`** - PostgreSQL implementation with optimized queries
- **`filter.ts`** - Helper for creating event filters

**Responsibilities**:
- Store events immutably in PostgreSQL
- Query events with filtering and payload-based searches
- Provide optimistic locking for consistency
- Auto-dispatch events to connected streams

### 🌊 **EventStream Module** (`src/eventstream/`)

**Purpose**: Real-time event processing and projections

**Key Components**:
- **`types.ts`** - Stream interfaces (EventStream, StreamSubscription)
- **`memory.ts`** - In-memory stream implementation
- **`projection.ts`** - Projection system with database integration
- **`stream.ts`** - Event filtering and subscription utilities

**Responsibilities**:
- Receive events from EventStore
- Filter events for specific subscribers
- Manage subscriptions and batching
- Provide projection infrastructure

### 🏦 **Examples** (`src/examples/banking/`)

**Purpose**: Feature-sliced banking application demonstrating usage

**Key Components**:
- **`features/`** - Individual feature slices (accounts, deposits, etc.)
- **`cli.ts`** - Interactive command-line interface
- **Feature Structure**:
  - `core.ts` - Pure business logic
  - `shell.ts` - EventStore integration
  - `types.ts` - Domain types and interfaces

## Event Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                Event Flow                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐  append()  ┌─────────────┐  dispatch()  ┌─────────────┐      │
│  │   Command   │ ─────────▶ │ EventStore  │ ────────────▶ │ EventStream │      │
│  │  Handler    │            │             │              │             │      │
│  └─────────────┘            └─────────────┘              └─────────────┘      │
│                                     │                            │             │
│                                     ▼                            ▼             │
│  ┌─────────────┐            ┌─────────────┐              ┌─────────────┐      │
│  │  PostgreSQL │            │   Events    │              │   Filtered  │      │
│  │  Database   │            │   Saved     │              │   Events    │      │
│  └─────────────┘            └─────────────┘              └─────────────┘      │
│                                                                   │             │
│                                                                   ▼             │
│                                                          ┌─────────────┐      │
│                                                          │ Projection  │      │
│                                                          │ Subscribers │      │
│                                                          └─────────────┘      │
│                                                                   │             │
│                                                                   ▼             │
│                                                          ┌─────────────┐      │
│                                                          │ Read Models │      │
│                                                          │   Updated   │      │
│                                                          └─────────────┘      │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Projection System

The projection system automatically keeps read models synchronized with events:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            Projection Architecture                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐              ┌─────────────┐              ┌─────────────┐     │
│  │   Events    │              │ Projection  │              │    Read     │     │
│  │             │              │   System    │              │   Models    │     │
│  │ ┌─────────┐ │              │             │              │             │     │
│  │ │Account  │ │──────────────│ ┌─────────┐ │──────────────│ ┌─────────┐ │     │
│  │ │Opened   │ │              │ │Account  │ │              │ │Accounts │ │     │
│  │ └─────────┘ │              │ │Listener │ │              │ │ Table   │ │     │
│  │             │              │ └─────────┘ │              │ └─────────┘ │     │
│  │ ┌─────────┐ │              │             │              │             │     │
│  │ │Money    │ │──────────────│ ┌─────────┐ │──────────────│ ┌─────────┐ │     │
│  │ │Deposited│ │              │ │User     │ │              │ │Users    │ │     │
│  │ └─────────┘ │              │ │Listener │ │              │ │ Table   │ │     │
│  │             │              │ └─────────┘ │              │ └─────────┘ │     │
│  │ ┌─────────┐ │              │             │              │             │     │
│  │ │User     │ │──────────────│ ┌─────────┐ │──────────────│ ┌─────────┐ │     │
│  │ │Created  │ │              │ │Other    │ │              │ │Other    │ │     │
│  │ └─────────┘ │              │ │Listeners│ │              │ │ Views   │ │     │
│  │             │              │ └─────────┘ │              │ └─────────┘ │     │
│  └─────────────┘              └─────────────┘              └─────────────┘     │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Setup
```bash
# Install dependencies
npm install

# Start PostgreSQL
docker run --name eventstore-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=eventstore -p 5432:5432 -d postgres:15

# Set connection string
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/eventstore"
```

### 2. Basic Usage
```typescript
import { PostgresEventStore } from './src/eventstore';
import { MemoryEventStream, configureProjector, startProjectionListener } from './src/eventstream';

// Connect EventStore and EventStream
const eventStream = new MemoryEventStream();
const eventStore = new PostgresEventStore({ eventStream });
await eventStore.initializeDatabase();

// Setup projections
configureProjector({ 
  connectionString: process.env.DATABASE_URL! 
});

// Start projection listener
const stopListener = await startProjectionListener(eventStream, {
  eventTypes: ['UserRegistered', 'UserUpdated'],
  handlers: {
    'UserRegistered': async (event) => {
      // Update users table
      await insertUser(event.payload);
    },
    'UserUpdated': async (event) => {
      // Update users table
      await updateUser(event.payload);
    }
  }
});

// Store events - projections update automatically
await eventStore.append([{
  eventType: 'UserRegistered',
  payload: { userId: '123', email: 'user@example.com' }
}]);
```

### 3. Run Banking Example
```bash
npm run example:banking
```

## Key Features

### 🔒 **Optimistic Locking**
Ensures consistency without traditional database locks by validating context hasn't changed:

```typescript
// Query with context
const filter = createFilter(['BankAccountOpened'], [{ accountId: 'acc-123' }]);
const result = await eventStore.query(filter);

// Business logic
const events = processCommand(result.events);

// Append with context validation
await eventStore.append(events, filter, result.maxSequenceNumber);
```

### 🎯 **Payload-Based Querying**
Precise event filtering using PostgreSQL JSONB operators:

```typescript
// Filter by event content
const filter = createFilter(
  ['MoneyDeposited', 'MoneyWithdrawn'],
  [{ accountId: 'acc-123', currency: 'USD' }]
);
const events = await eventStore.query(filter);
```

### ⚡ **Real-time Projections**
Automatically update read models when events occur:

```typescript
// Define projection
const config = createProjectionConfig(
  ['UserRegistered', 'UserUpdated'],
  {
    'UserRegistered': async (event) => {
      await insertUser(event.payload);
    },
    'UserUpdated': async (event) => {
      await updateUser(event.payload);
    }
  }
);

// Start listening - updates happen automatically
await startProjectionListener(eventStream, config);
```

### 🏗️ **Feature-Sliced Architecture**
Organize code by business capabilities:

```
features/
├── user-management/
│   ├── core.ts          # Pure business logic
│   ├── shell.ts         # EventStore integration
│   └── types.ts         # Domain types
├── account-management/
│   ├── core.ts
│   ├── shell.ts
│   └── types.ts
└── list-accounts/       # Projection example
    ├── projector.ts     # Database operations
    ├── listener.ts      # Event handling
    └── query.ts         # Read queries
```

## Performance Characteristics

- **Storage**: PostgreSQL with optimized JSONB indexing
- **Querying**: GIN indexes for fast payload-based searches
- **Streaming**: Batched event processing for high throughput
- **Projections**: Configurable batch sizes and error handling
- **Connections**: Connection pooling for database efficiency

## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details