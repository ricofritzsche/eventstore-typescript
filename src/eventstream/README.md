# EventStream Module

The EventStream module provides real-time event processing and projection capabilities. It listens to events and updates read models (like database tables) automatically.

## What it does

**EventStream** is like a notification system that:
- Listens for events as they happen
- Sends events to subscribers who are interested
- Helps build projections (read models) that stay up-to-date

## Structure

### Core Files

**`types.ts`** - The basic building blocks:
- `EventStream` - Main interface for event streaming
- `StreamSubscription` - Represents a listener for events
- `HandleEvents` - Function that processes events
- `PersistentEventStream` - Advanced stream with checkpoints

**`stream.ts`** - Helper utilities:
- `createStreamSubscription()` - Creates a subscription
- `matchesFilter()` - Checks if an event matches a filter
- `filterEvents()` - Filters a list of events

**`memory.ts`** - In-memory implementation:
- `MemoryEventStream` - Simple event stream that runs in memory
- Good for development and testing

**`projection.ts`** - Projection system:
- `ProjectionConfig` - Configuration for projections
- `ProjectorConfig` - Database configuration for projectors
- `startProjectionListener()` - Starts listening and updating projections

**`index.ts`** - Entry point that exports everything you need

## How it works

1. **Subscribe**: Your projection subscribes to specific event types
2. **Dispatch**: When events happen, they are sent to the stream
3. **Filter**: Stream filters events and sends only relevant ones to subscribers
4. **Process**: Subscriber processes events and updates read models (like database tables)

## Simple Example

```typescript
import { MemoryEventStream, configureProjector, startProjectionListener } from './eventstream';

// Setup
const eventStream = new MemoryEventStream();
configureProjector({ connectionString: 'postgres://...' });

// Create projection that listens to events
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

// When events happen, projections auto-update
await eventStream.dispatch([{
  eventType: 'UserRegistered',
  payload: { userId: '123', email: 'user@example.com' }
}]);
```

## Key Concepts

- **Real-time**: Events are processed as they happen
- **Filtered**: Each subscriber only gets events they care about
- **Projections**: Build read models that stay synchronized with events
- **Configurable**: Easy to set up different projections for different features
- **Batched**: Events can be processed in batches for better performance

## Projection Pattern

The module makes it easy to build projections:

1. **Configure**: Set up database connection once
2. **Define Handlers**: Create functions that process each event type
3. **Start Listening**: Use `startProjectionListener()` to begin processing
4. **Automatic Updates**: Your read models stay in sync automatically

This pattern is used throughout the application to keep different views of data (like account balances, user profiles, etc.) up-to-date with the latest events.