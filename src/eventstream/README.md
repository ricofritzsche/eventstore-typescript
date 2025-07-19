# EventStream Module

The EventStream module provides minimal event streaming capabilities for real-time event processing. It focuses on simple subscription management and event dispatching.

## What it does

**EventStream** is a lightweight notification system that:
- Allows features to subscribe to events with a simple handler function
- Dispatches events to all active subscriptions
- Provides basic error handling and subscription management

## Structure

### Core Files

**`types.ts`** - The basic interfaces:
- `EventStream` - Main interface with `subscribe()`, `dispatch()`, and `close()`
- `EventSubscription` - Represents a subscription with `unsubscribe()`
- `HandleEvents` - Function signature for processing event batches

**`memory.ts`** - In-memory implementation:
- `MemoryEventStream` - Simple event stream that runs in memory
- Perfect for development, testing, and lightweight applications

**`index.ts`** - Entry point that exports the core interfaces

## How it works

1. **Subscribe**: Features subscribe with a simple handler function
2. **Dispatch**: Events are dispatched to all active subscribers
3. **Process**: Each subscriber processes the full event batch
4. **Error Handling**: Individual subscription errors don't affect others

## Simple Example

```typescript
import { MemoryEventStream } from './eventstream';
import { Event } from '../eventstore/types';

// Create stream
const eventStream = new MemoryEventStream();

// Subscribe with a handler
const subscription = await eventStream.subscribe(async (events: Event[]) => {
  for (const event of events) {
    switch (event.eventType) {
      case 'BankAccountOpened':
        await handleAccountOpened(event);
        break;
      case 'MoneyDeposited':
        await handleMoneyDeposited(event);
        break;
    }
  }
});

// Dispatch events
await eventStream.dispatch([{
  eventType: 'BankAccountOpened',
  payload: { accountId: '123', customerName: 'John Doe' }
}]);

// Cleanup
await subscription.unsubscribe();
```

## Key Design Principles

- **Minimal Interface**: Only essential methods (`subscribe`, `dispatch`, `close`)
- **No Framework Lock-in**: Features handle their own projection logic
- **Simple Error Handling**: Failed subscriptions don't affect others
- **Stateless Handlers**: Event handlers are pure functions that process event batches
- **Feature Ownership**: Each feature decides how to process events

## Integration with EventStore

The EventStore can automatically dispatch events to the EventStream:

```typescript
const eventStream = new MemoryEventStream();
const eventStore = new PostgresEventStore({ eventStream });

// Events are automatically dispatched when appended to the store
await eventStore.append(events, filter, maxSequenceNumber);
```

This module provides the foundation for real-time event processing while keeping complexity to a minimum.