# EventStore

A comprehensive TypeScript implementation of event sourcing with real-time event subscriptions and projections. This system provides persistent event storage with automatic notification to subscribers for building responsive, event-sourced applications.

## High-Level Architecture

The system is built around a core EventStore with pluggable notification system:

### **EventStore** - The Source of Truth
- **Persistent Storage**: Events are immutably stored in PostgreSQL
- **Query Engine**: Fast retrieval with filtering and payload-based queries
- **Optimistic Locking**: Ensures consistency without traditional database locks
- **Auto-Notification**: Automatically notifies subscribers when events are appended
- **Pluggable Notifiers**: Configurable notification systems (memory, database, etc.)

### **Event Notifiers** - Real-time Processing  
- **Subscription Management**: Multiple subscribers can listen to the same events
- **Concurrent Processing**: Events are processed by all subscribers simultaneously
- **Error Isolation**: If one subscriber fails, others continue processing
- **Lifecycle Management**: Clean subscription setup and teardown

## Core Modules

### **EventStore Module** (`src/eventstore/`)

**Purpose**: Persistent event storage with real-time notifications

**Key Components**:
- **`types.ts`** - Core interfaces (Event, EventStore, EventStreamNotifier)
- **`stores/postgres/`** - PostgreSQL implementation with subscription support
- **`notifiers/memory/`** - In-memory notification system (default)
- **`filter.ts`** - Helper for creating event filters

**Responsibilities**:
- Store events immutably in PostgreSQL
- Query events with filtering and payload-based searches
- Provide optimistic locking for consistency
- Notify subscribers immediately when events are appended
- Manage subscription lifecycle

### **Examples** (`src/examples/banking/`)

**Purpose**: Feature-sliced banking application demonstrating real-world usage

**Key Components**:
- **`features/`** - Individual feature slices with projections
- **`cli.ts`** - Interactive command-line interface
- **Feature Structure**:
  - `core.ts` - Pure business logic
  - `shell.ts` - EventStore integration
  - `types.ts` - Domain types and interfaces
  - `projector.ts` - Database projection logic
  - `listener.ts` - Event subscription handlers

**Banking Features**:
- **Account Management**: Open accounts, deposits, withdrawals, transfers
- **Account Projections**: Real-time account balance updates
- **Analytics Projections**: Monthly account opening statistics
- **Rebuild Functionality**: Projection recovery from event history

## Event Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                Event Flow                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  ┌─────────────┐  append()  ┌─────────────┐   notify()   ┌─────────────┐       │
│  │   Command   │ ─────────▶ │ EventStore  │ ────────────▶ │   Event     │       │
│  │  Handler    │            │             │              │  Notifier   │       │
│  └─────────────┘            └─────────────┘              └─────────────┘       │
│                                     │                            │              │
│                                     ▼                            ▼              │
│  ┌─────────────┐            ┌─────────────┐              ┌─────────────┐       │
│  │  PostgreSQL │            │   Events    │              │  Multiple   │       │
│  │  Database   │            │   Saved     │              │ Subscribers │       │
│  └─────────────┘            └─────────────┘              └─────────────┘       │
│                                                                   │              │
│                                                                   ▼              │
│                                                          ┌─────────────┐       │
│  ┌─────────────┐                                         │ Concurrent  │       │
│  │  Queries    │ ◀───────────────────────────────────────│ Processing  │       │
│  │             │                                         │             │       │
│  └─────────────┘                                         └─────────────┘       │
│                                                                   │              │
│                                                                   ▼              │
│                                                          ┌─────────────┐       │
│                                                          │ Projections │       │
│                                                          │   Updated   │       │
│                                                          └─────────────┘       │
│                                                                                 │
│                          Real-time, concurrent event processing                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Subscription System

The subscription system enables real-time, concurrent processing:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         Subscription Architecture                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│                              ┌─────────────┐                                   │
│                              │ EventStore  │                                   │
│                              │             │                                   │
│                              │ ┌─────────┐ │                                   │
│                              │ │New Event│ │                                   │
│                              │ │Appended │ │                                   │
│                              │ └─────────┘ │                                   │
│                              └──────┬──────┘                                   │
│                                     │                                          │
│                                     ▼                                          │
│                              ┌─────────────┐                                   │
│                              │Event        │                                   │
│                              │Notifier     │                                   │
│                              │(Memory)     │                                   │
│                              └──────┬──────┘                                   │
│                                     │                                          │
│                    ┌────────────────┼────────────────┐                        │
│                    │                │                │                        │
│                    ▼                ▼                ▼                        │
│            ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│            │ Account     │  │ Analytics   │  │   Other     │                 │
│            │ Projection  │  │ Projection  │  │ Subscribers │                 │
│            │ Subscriber  │  │ Subscriber  │  │             │                 │
│            └─────────────┘  └─────────────┘  └─────────────┘                 │
│                    │                │                │                        │
│                    ▼                ▼                ▼                        │
│            ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│            │  accounts   │  │account_     │  │   Custom    │                 │
│            │   table     │  │ analytics   │  │   Logic     │                 │
│            │             │  │   table     │  │             │                 │
│            └─────────────┘  └─────────────┘  └─────────────┘                 │
│                                                                                 │
│              Concurrent, independent processing of the same events             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Setup
```bash
# Install dependencies
npm install

# Start Postgres
docker run --name eventstore-postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=bank -p 5432:5432 -d postgres:15

# Set connection string
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/bank"
```

### 2. Basic Usage
```typescript
import { PostgresEventStore, createFilter } from './src/eventstore';

// Create EventStore with default MemoryEventStreamNotifier
const eventStore = new PostgresEventStore();
await eventStore.initializeDatabase();

// Subscribe to events for real-time processing
const subscription = await eventStore.subscribe(async (events) => {
  for (const event of events) {
    console.log('Processing event:', event.eventType);
    
    // Update projections, analytics, send notifications, etc.
    switch (event.eventType) {
      case 'BankAccountOpened':
        await updateAccountProjection(event);
        await updateAnalytics(event);
        break;
      case 'MoneyDeposited':
        await updateAccountBalance(event);
        break;
    }
  }
});
````



### 3. Run Banking Example
```bash
npm run example:banking
```

**Features in Banking CLI**:
- **0-6**: Banking operations (open account, deposit, withdraw, transfer, view balance)
- **7**: View analytics (monthly account opening statistics)
- **98**: Rebuild analytics projections from event history
- **99**: Rebuild account projections from event history



### 4. Pluggable Notifiers
Replace the notification system with your own:

```typescript
import { EventStreamNotifier } from './src/eventstore/types';

class DatabaseEventStreamNotifier implements EventStreamNotifier {
  // Custom implementation using database triggers, message queues, etc.
}

const eventStore = new PostgresEventStore({
  notifier: new DatabaseEventStreamNotifier()
});
```


## Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
```

**Test Coverage**:
- EventStore core functionality
- Subscription and notification systems
- Banking domain logic
- Projection systems
- Error handling and edge cases





## License

MIT License - see LICENSE file for details