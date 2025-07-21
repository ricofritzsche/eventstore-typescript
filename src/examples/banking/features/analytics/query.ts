import { Pool } from 'pg';
import { AnalyticsQuery, AnalyticsResult, MonthlyAccountStats } from './types';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export async function getAccountAnalytics(
  connectionString: string,
  query: AnalyticsQuery = {},
  tableName: string = 'account_analytics'
): Promise<AnalyticsResult> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (query.year) {
      conditions.push(`year = $${paramIndex}`);
      params.push(query.year);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = query.months ? `LIMIT ${query.months}` : '';
    
    const sql = `
      SELECT year, month, account_openings, total_accounts 
      FROM ${tableName} 
      ${whereClause}
      ORDER BY year DESC, month DESC 
      ${limitClause}
    `;

    const result = await client.query(sql, params);

    const monthlyStats: MonthlyAccountStats[] = result.rows.map(row => {
      const monthIndex = parseInt(row.month) - 1;
      return {
        year: parseInt(row.year),
        month: parseInt(row.month),
        accountOpenings: parseInt(row.account_openings),
        totalAccounts: parseInt(row.total_accounts),
        monthName: MONTH_NAMES[monthIndex] || 'Unknown'
      };
    });

    return {
      monthlyStats,
      totalCount: monthlyStats.length
    };
  } finally {
    client.release();
    await pool.end();
  }
}