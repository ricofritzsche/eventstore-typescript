import { Pool } from 'pg';
import { EventRecord } from '../../../../eventstore/types';
import { createFilter } from '../../../../eventstore';

export async function createAccountsTable(connectionString: string, tableName: string = 'accounts'): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        account_id VARCHAR(255) PRIMARY KEY,
        customer_name VARCHAR(255) NOT NULL,
        account_type VARCHAR(50) NOT NULL CHECK (account_type IN ('checking', 'savings')),
        balance DECIMAL(19,2) NOT NULL DEFAULT 0,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        opened_at TIMESTAMP WITH TIME ZONE NOT NULL,
        last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        last_event_sequence_number BIGINT NOT NULL DEFAULT 0
      )
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${tableName}_customer_name ON ${tableName}(customer_name);
    `);
  } finally {
    client.release();
    await pool.end();
  }
}

export async function handleAccountOpened(event: EventRecord, connectionString: string, tableName: string = 'accounts'): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    const { accountId, customerName, accountType, initialDeposit, currency, openedAt } = event.payload;
    
    await client.query(
      `INSERT INTO ${tableName} 
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
  } finally {
    client.release();
    await pool.end();
  }
}

export async function handleMoneyDeposited(event: EventRecord, connectionString: string, tableName: string = 'accounts'): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    const { accountId, amount, currency } = event.payload;
    
    await client.query(
      `UPDATE ${tableName} 
       SET balance = balance + $1, last_updated_at = NOW(), last_event_sequence_number = $4
       WHERE account_id = $2 AND currency = $3`,
      [amount, accountId, currency, event.sequenceNumber]
    );
  } finally {
    client.release();
    await pool.end();
  }
}

export async function handleMoneyWithdrawn(event: EventRecord, connectionString: string, tableName: string = 'accounts'): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    const { accountId, amount, currency } = event.payload;
    
    await client.query(
      `UPDATE ${tableName} 
       SET balance = balance - $1, last_updated_at = NOW(), last_event_sequence_number = $4
       WHERE account_id = $2 AND currency = $3`,
      [amount, accountId, currency, event.sequenceNumber]
    );
  } finally {
    client.release();
    await pool.end();
  }
}

export async function handleMoneyTransferred(event: EventRecord, connectionString: string, tableName: string = 'accounts'): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    const { fromAccountId, toAccountId, amount, currency } = event.payload;

    await client.query(
      `UPDATE ${tableName} 
       SET balance = balance - $1, last_updated_at = NOW(), last_event_sequence_number = $4
       WHERE account_id = $2 AND currency = $3`,
      [amount, fromAccountId, currency, event.sequenceNumber]
    );

    await client.query(
      `UPDATE ${tableName} 
       SET balance = balance + $1, last_updated_at = NOW(), last_event_sequence_number = $4
       WHERE account_id = $2 AND currency = $3`,
      [amount, toAccountId, currency, event.sequenceNumber]
    );
  } finally {
    client.release();
    await pool.end();
  }
}

export async function rebuildAccountProjections(eventStore: any, connectionString: string, tableName: string = 'accounts'): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    // Clear existing projection data
    await client.query(`DELETE FROM ${tableName}`);
    console.log('🗑️  Cleared existing account projections');
    
    // Query all events from the event store using createFilter
    const filter = createFilter(['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred']);
    const { events } = await eventStore.query(filter);
    console.log(`📥 Found ${events.length} events to replay`);
    
    // Replay all events in sequence order
    for (const event of events) {
      switch (event.eventType) {
        case 'BankAccountOpened':
          await handleAccountOpened(event, connectionString, tableName);
          break;
        case 'MoneyDeposited':
          await handleMoneyDeposited(event, connectionString, tableName);
          break;
        case 'MoneyWithdrawn':
          await handleMoneyWithdrawn(event, connectionString, tableName);
          break;
        case 'MoneyTransferred':
          await handleMoneyTransferred(event, connectionString, tableName);
          break;
      }
    }
    
    console.log('✅ Account projections rebuilt successfully');
  } finally {
    client.release();
    await pool.end();
  }
}