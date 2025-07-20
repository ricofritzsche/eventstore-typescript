import { Pool } from 'pg';
import { EventRecord } from '../../../../eventstore/types';

export async function createAnalyticsTable(connectionString: string, tableName: string = 'account_analytics'): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        year INTEGER NOT NULL,
        month INTEGER NOT NULL,
        account_openings INTEGER NOT NULL DEFAULT 0,
        total_accounts INTEGER NOT NULL DEFAULT 0,
        last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        last_event_sequence_number BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (year, month)
      )
    `);
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_${tableName}_year_month ON ${tableName}(year DESC, month DESC);
    `);
    
    console.log('📊 Analytics table created/verified');
  } finally {
    client.release();
    await pool.end();
  }
}

export async function handleAccountOpened(event: EventRecord, connectionString: string, tableName: string = 'account_analytics'): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    const openedAt = event.payload.openedAt ? new Date(event.payload.openedAt as string | Date) : event.timestamp;
    const year = openedAt.getFullYear();
    const month = openedAt.getMonth() + 1; // JavaScript months are 0-based
    
    // Insert or update the monthly stats
    await client.query(
      `INSERT INTO ${tableName} 
       (year, month, account_openings, total_accounts, last_updated_at, last_event_sequence_number) 
       VALUES ($1, $2, 1, 1, NOW(), $3)
       ON CONFLICT (year, month) DO UPDATE SET
         account_openings = ${tableName}.account_openings + 1,
         total_accounts = ${tableName}.total_accounts + 1,
         last_updated_at = NOW(),
         last_event_sequence_number = GREATEST(${tableName}.last_event_sequence_number, EXCLUDED.last_event_sequence_number)`,
      [year, month, event.sequenceNumber]
    );
    
    console.log(`📈 Updated analytics for ${year}-${month.toString().padStart(2, '0')}: +1 account opening`);
  } finally {
    client.release();
    await pool.end();
  }
}

export async function rebuildAnalyticsProjections(eventStore: any, connectionString: string, tableName: string = 'account_analytics'): Promise<void> {
  const pool = new Pool({ connectionString });
  const client = await pool.connect();
  
  try {
    // Clear existing analytics data
    await client.query(`DELETE FROM ${tableName}`);
    console.log('🗑️  Cleared existing analytics projections');
    
    // Query all BankAccountOpened events from the event store using createFilter
    const { createFilter } = await import('../../../../eventstore');
    const filter = createFilter(['BankAccountOpened']);
    const { events } = await eventStore.query(filter);
    console.log(`📥 Found ${events.length} BankAccountOpened events to replay`);
    
    // Replay all account opening events
    for (const event of events) {
      if (event.eventType === 'BankAccountOpened') {
        await handleAccountOpened(event, connectionString, tableName);
      }
    }
    
    console.log('✅ Analytics projections rebuilt successfully');
  } finally {
    client.release();
    await pool.end();
  }
}