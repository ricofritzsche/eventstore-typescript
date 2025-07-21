# List Accounts Feature

This feature demonstrates how to implement real-time projections using the EventStore subscription system. It maintains a read model (database table) that gets automatically updated whenever banking events occur, with sequence number tracking for debugging and consistency.

## How it works

1. **EventStore Subscription**: Uses `eventStore.subscribe(handleEvents)` to listen for all events in real-time
2. **Event Filtering**: Processes only relevant banking events (`BankAccountOpened`, `MoneyDeposited`, etc.)
3. **Direct Database Updates**: Updates the `accounts` table immediately when events occur
4. **Sequence Tracking**: Tracks the last event sequence number that affected each account row
5. **Query Interface**: Provides interface to list accounts with current balances
6. **Rebuild Capability**: Can rebuild projections from complete event history

## Components

- `listener.ts` - Subscribes to EventStore and routes events to projection handlers
- `projector.ts` - Handles database operations and schema creation
- `query.ts` - Queries the current state of accounts with filtering
- `handler.ts` - Main query interface for the feature
- `types.ts` - Domain types for accounts and queries

## Key Architecture

The feature uses EventStore's built-in subscription system for real-time updates:

```typescript
// EventStore subscription (replaces old EventStream)
const subscription = await eventStore.subscribe(async (events: EventRecord[]) => {
  for (const event of events) {
    switch (event.eventType) {
      case 'BankAccountOpened':
        await handleAccountOpened(event, connectionString);
        break;
      case 'MoneyDeposited':
        await handleMoneyDeposited(event, connectionString);
        break;
      // ... other events with sequence number tracking
    }
  }
});
```

## Database Schema

```sql
CREATE TABLE accounts (
    account_id VARCHAR(255) PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) NOT NULL CHECK (account_type IN ('checking', 'savings')),
    balance DECIMAL(19,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_event_sequence_number BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_accounts_customer_name ON accounts(customer_name);
```

## Event Handling

Each event handler updates both the business data and tracks the sequence number:

```typescript
export async function handleAccountOpened(event: EventRecord, connectionString: string): Promise<void> {
  const { accountId, customerName, accountType, initialDeposit, currency, openedAt } = event.payload;
  
  await client.query(
    `INSERT INTO accounts 
     (account_id, customer_name, account_type, balance, currency, opened_at, last_updated_at, last_event_sequence_number) 
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
     ON CONFLICT (account_id) DO UPDATE SET
       customer_name = EXCLUDED.customer_name,
       account_type = EXCLUDED.account_type,
       balance = EXCLUDED.balance,
       currency = EXCLUDED.currency,
       opened_at = EXCLUDED.opened_at,
       last_updated_at = NOW(),
       last_event_sequence_number = EXCLUDED.last_event_sequence_number`,
    [accountId, customerName, accountType, initialDeposit || 0, currency || 'USD', openedAt || new Date(), event.sequenceNumber]
  );
}
```

## Usage

### Start Real-time Projection

The projection starts automatically when the banking CLI initializes:

```typescript
import { startAccountProjectionListener } from './features/list-accounts';

// Initialize EventStore with subscription capability
const eventStore = new PostgresEventStore();
await eventStore.initializeDatabase();

// Create accounts table
await createAccountsTable(connectionString);

// Start real-time projection listener
const stopListener = await startAccountProjectionListener(eventStore, connectionString);
```

### Query Accounts

```typescript
import { queryHandler } from './features/list-accounts';

// List all accounts
const result = await queryHandler(connectionString);
console.log(`Found ${result.totalCount} accounts`);

// List accounts with filtering
const result = await queryHandler(connectionString, {
  accountType: 'checking',
  customerName: 'John'
});
```

### Rebuild Projections

```typescript
import { rebuildAccountProjections } from './features/list-accounts';

// Rebuild from complete event history
await rebuildAccountProjections(eventStore, connectionString);
```

## Real-time Features

- **Immediate Updates**: Account balances update instantly when transactions occur
- **Concurrent Processing**: Multiple projections can process the same events simultaneously  
- **Error Isolation**: If this projection fails, others continue working
- **Sequence Tracking**: Each row tracks the last event that modified it
- **Rebuild Capability**: Can reconstruct projections from event history

## CLI Integration

Available in the banking CLI:
- **Option 0**: List all accounts (uses this projection)
- **Option 99**: Rebuild account projections from event history

## Benefits of EventStore Subscription

1. **Real-time Processing**: Events are processed immediately when appended
2. **No Polling**: Direct notification system, no database polling required
3. **Scalable**: Multiple subscribers can process events concurrently
4. **Reliable**: Built-in error handling and subscription lifecycle management
5. **Debuggable**: Sequence numbers help track which events affected each row
6. **Recoverable**: Can rebuild entire projection from event history

This feature demonstrates the modern EventStore subscription approach: direct event subscription with real-time projection updates and comprehensive rebuild capabilities.