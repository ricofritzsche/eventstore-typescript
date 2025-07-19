# List Accounts Feature

This feature demonstrates how to implement projections in the event sourcing system. It maintains a read model (database table) that gets automatically updated whenever banking events occur.

## How it works

1. **Simple Subscription**: Uses `eventStream.subscribe(handleEvents)` to listen for all events
2. **Event Handling**: Filters and processes relevant banking events in the handler
3. **Direct Database Updates**: Updates the `accounts` table directly for each event type
4. **Query Interface**: Provides a simple interface to list all accounts with current balances

## Components

- `listener.ts` - Subscribes to the event stream and routes events to handlers
- `projector.ts` - Handles database operations (insert/update account records)  
- `query.ts` - Queries the current state of accounts
- `types.ts` - Domain types for accounts

## Key Design

The feature handles its own projection logic without relying on framework abstractions:

```typescript
// Simple subscription
const subscription = await eventStream.subscribe(handleEvents);

// Direct event handling
const handleEvents = async (events: Event[]) => {
  for (const event of events) {
    switch (event.eventType) {
      case 'BankAccountOpened':
        await handleAccountOpened(event, connectionString);
        break;
      // ... other events
    }
  }
};
```

## Database Schema

```sql
CREATE TABLE accounts (
    account_id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    balance DECIMAL(15,2) NOT NULL,
    currency TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Usage

The projection runs automatically when the CLI is started:

```typescript
import { startAccountProjectionListener } from './listener';

const stopListener = await startAccountProjectionListener(eventStream, connectionString);
```

To query accounts:
```typescript
import { listAccounts } from './query';

const accounts = await listAccounts();
```

This feature demonstrates the minimal approach: direct event stream subscription with feature-owned projection logic.