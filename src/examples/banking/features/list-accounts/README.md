# List Accounts Feature

This feature demonstrates how projections work in the event sourcing system. It maintains a read model (database table) that gets automatically updated whenever banking events occur.

## How it works

1. **Event Listener**: Listens for `BankAccountOpened`, `MoneyDeposited`, `MoneyWithdrawn`, and `MoneyTransferred` events from the event stream
2. **Projection**: Updates the `accounts` table in real-time as events are processed
3. **Query**: Provides a simple interface to list all accounts with current balances

## Components

- `listener.ts` - Subscribes to events and triggers projection updates
- `projector.ts` - Handles database operations (insert/update account records)  
- `query.ts` - Queries the current state of accounts
- `types.ts` - Domain types for accounts

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

The projection runs automatically when the CLI is started. Accounts are created when `BankAccountOpened` events occur, and balances are updated for deposit, withdrawal, and transfer events.

To query accounts:
```typescript
import { listAccounts } from './query';

const accounts = await listAccounts();
```

This feature serves as an example of how to implement event-driven projections for read models in the banking system.