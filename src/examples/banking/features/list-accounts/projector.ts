import { Pool } from 'pg';
import { Event } from '../../../../eventstore/types';
import { getProjectorConfig } from '../../../../eventstream';

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
        last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
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

export async function handleAccountOpened(event: Event): Promise<void> {
  const config = getProjectorConfig();
  const pool = new Pool({ connectionString: config.connectionString });
  const client = await pool.connect();
  
  try {
    const { accountId, customerName, accountType, initialDeposit, currency, openedAt } = event.payload;
    
    await client.query(
      `INSERT INTO ${config.tableName || 'accounts'} 
       (account_id, customer_name, account_type, balance, currency, opened_at, last_updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (account_id) DO UPDATE SET
         customer_name = EXCLUDED.customer_name,
         account_type = EXCLUDED.account_type,
         balance = EXCLUDED.balance,
         currency = EXCLUDED.currency,
         opened_at = EXCLUDED.opened_at,
         last_updated_at = NOW()`,
      [accountId, customerName, accountType, initialDeposit || 0, currency || 'USD', openedAt || new Date()]
    );
  } finally {
    client.release();
    await pool.end();
  }
}

export async function handleMoneyDeposited(event: Event): Promise<void> {
  const config = getProjectorConfig();
  const pool = new Pool({ connectionString: config.connectionString });
  const client = await pool.connect();
  
  try {
    const { accountId, amount, currency } = event.payload;
    
    await client.query(
      `UPDATE ${config.tableName || 'accounts'} 
       SET balance = balance + $1, last_updated_at = NOW()
       WHERE account_id = $2 AND currency = $3`,
      [amount, accountId, currency]
    );
  } finally {
    client.release();
    await pool.end();
  }
}

export async function handleMoneyWithdrawn(event: Event): Promise<void> {
  const config = getProjectorConfig();
  const pool = new Pool({ connectionString: config.connectionString });
  const client = await pool.connect();
  
  try {
    const { accountId, amount, currency } = event.payload;
    
    await client.query(
      `UPDATE ${config.tableName || 'accounts'} 
       SET balance = balance - $1, last_updated_at = NOW()
       WHERE account_id = $2 AND currency = $3`,
      [amount, accountId, currency]
    );
  } finally {
    client.release();
    await pool.end();
  }
}

export async function handleMoneyTransferred(event: Event): Promise<void> {
  const config = getProjectorConfig();
  const pool = new Pool({ connectionString: config.connectionString });
  const client = await pool.connect();
  
  try {
    const { fromAccountId, toAccountId, amount, currency } = event.payload;

    await client.query(
      `UPDATE ${config.tableName || 'accounts'} 
       SET balance = balance - $1, last_updated_at = NOW()
       WHERE account_id = $2 AND currency = $3`,
      [amount, fromAccountId, currency]
    );

    await client.query(
      `UPDATE ${config.tableName || 'accounts'} 
       SET balance = balance + $1, last_updated_at = NOW()
       WHERE account_id = $2 AND currency = $3`,
      [amount, toAccountId, currency]
    );
  } finally {
    client.release();
    await pool.end();
  }
}