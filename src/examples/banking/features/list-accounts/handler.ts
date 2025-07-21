import { Pool } from 'pg';
import { Account, AccountsResult } from './types';

// TODO Rico: Implement Account Query

/**
 * Handles a database query to fetch account details, ordered by their opening date in descending order.
 *
 * @param {string} connectionString - The database connection string used to connect to the PostgreSQL database.
 * @return {Promise<AccountsResult>} A promise that resolves to an object containing a list of account details and the total count of fetched accounts.
 */
export async function queryHandler(
  connectionString: string
): Promise<AccountsResult> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    const sql = `SELECT * FROM accounts ORDER BY opened_at DESC`;
    const result = await client.query(sql);

    const accounts: Account[] = result.rows.map(row => ({
      accountId: row.account_id,
      customerName: row.customer_name,
      accountType: row.account_type,
      balance: parseFloat(row.balance),
      currency: row.currency,
      openedAt: new Date(row.opened_at),
      lastUpdatedAt: new Date(row.last_updated_at),
      lastEventSequenceNumber: parseInt(row.last_event_sequence_number)
    }));

    return {
      accounts,
      totalCount: accounts.length
    };
  } finally {
    client.release();
    await pool.end();
  }
}