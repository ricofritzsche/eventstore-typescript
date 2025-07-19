import { Pool } from 'pg';
import { Account, AccountsQuery, AccountsResult } from './types';

// TODO: Implement Account Query
export async function listAccounts(
  connectionString: string,
  query: AccountsQuery = {}
): Promise<AccountsResult> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (query.accountId) {
      conditions.push(`account_id = $${paramIndex}`);
      params.push(query.accountId);
      paramIndex++;
    }

    if (query.customerName) {
      conditions.push(`customer_name ILIKE $${paramIndex}`);
      params.push(`%${query.customerName}%`);
      paramIndex++;
    }

    if (query.accountType) {
      conditions.push(`account_type = $${paramIndex}`);
      params.push(query.accountType);
      paramIndex++;
    }

    if (query.currency) {
      conditions.push(`currency = $${paramIndex}`);
      params.push(query.currency);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM accounts ${whereClause} ORDER BY opened_at DESC`;

    const result = await client.query(sql, params);

    const accounts: Account[] = result.rows.map(row => ({
      accountId: row.account_id,
      customerName: row.customer_name,
      accountType: row.account_type,
      balance: parseFloat(row.balance),
      currency: row.currency,
      openedAt: new Date(row.opened_at),
      lastUpdatedAt: new Date(row.last_updated_at)
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