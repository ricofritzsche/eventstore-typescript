import { Pool } from 'pg';
import { IEventStore, IEventFilter, IHasEventType, IQueryResult, IEventRecord } from './types';


export interface IPostgresEventStoreOptions {
  connectionString?: string;
}


export class PostgresEventStore implements IEventStore {
  private pool: Pool;
  private readonly dbName: string;

  constructor(options: IPostgresEventStoreOptions = {}) {
    const connectionString = options.connectionString || process.env.DATABASE_URL;
    
    if (!connectionString) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    this.dbName = this.getDatabaseNameFromConnectionString(connectionString) || 'bank';
    this.pool = new Pool({ connectionString });
  }

  async query<T extends IHasEventType>(filter: IEventFilter): Promise<IQueryResult<T>> {
    const client = await this.pool.connect();
    try {
      // First get the max sequence number for the context
      const contextQuery = this.buildContextQuery(filter);
      const contextResult = await client.query(contextQuery.sql, contextQuery.params);
      const maxSequenceNumber = parseInt(contextResult.rows[0]?.max_seq || '0', 10);

      // Then get the actual events
      let query = 'SELECT * FROM events WHERE event_type = ANY($1)';
      const params: unknown[] = [filter.eventTypes];

      if (filter.payloadPredicates && Object.keys(filter.payloadPredicates).length > 0) {
        query += ' AND payload @> $2';
        params.push(JSON.stringify(filter.payloadPredicates));
      }

      if (filter.payloadPredicateOptions && filter.payloadPredicateOptions.length > 0) {
        const orConditions = filter.payloadPredicateOptions.map((_, index) => {
          const paramIndex = params.length + 1;
          params.push(JSON.stringify(filter.payloadPredicateOptions![index]));
          return `payload @> $${paramIndex}`;
        });
        query += ` AND (${orConditions.join(' OR ')})`;
      }

      query += ' ORDER BY sequence_number ASC';

      const result = await client.query(query, params);
      
      const events = result.rows.map(row => this.deserializeEvent<T>(row));
      
      return { events, maxSequenceNumber };
    } finally {
      client.release();
    }
  }

  async append<T extends IHasEventType>(filter: IEventFilter, events: T[], expectedMaxSequence: number): Promise<void> {
    if (events.length === 0) return;

    const client = await this.pool.connect();
    try {

      const eventTypes: string[] = [];
      const payloads: string[] = [];
      const metadata: string[] = [];

      for (const event of events) {
        eventTypes.push(event.eventType());
        payloads.push(JSON.stringify(event));
        metadata.push(JSON.stringify({
          version: event.eventVersion?.() || '1.0'
        }));
      }

      const contextQueryForCte = this.buildContextQuery(filter);
      const cteQuery = this.buildCteInsertQuery(filter, expectedMaxSequence);
      
      const params = [
        ...contextQueryForCte.params,                         // Context parameters (dynamic based on filter)
        eventTypes,                                           // Event types to insert
        payloads,                                             // Payloads to insert
        metadata                                             // Metadata to insert
      ];

      const result = await client.query(cteQuery, params);

      if (result.rowCount === 0) {
        throw new Error('Context changed: events were modified between query and append');
      }

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }
  }

  private buildContextQuery(filter: IEventFilter): { sql: string; params: unknown[] } {
    let sql = 'SELECT MAX(sequence_number) AS max_seq FROM events WHERE event_type = ANY($1)';
    const params: unknown[] = [filter.eventTypes];

    if (filter.payloadPredicates && Object.keys(filter.payloadPredicates).length > 0) {
      sql += ' AND payload @> $2';
      params.push(JSON.stringify(filter.payloadPredicates));
    }

    if (filter.payloadPredicateOptions && filter.payloadPredicateOptions.length > 0) {
      const orConditions = filter.payloadPredicateOptions.map((_, index) => {
        const paramIndex = params.length + 1;
        params.push(JSON.stringify(filter.payloadPredicateOptions![index]));
        return `payload @> $${paramIndex}`;
      });
      sql += ` AND (${orConditions.join(' OR ')})`;
    }

    return { sql, params };
  }

  private buildCteInsertQuery(filter: IEventFilter, expectedMaxSeq: number): string {
    const contextQuery = this.buildContextQuery(filter);
    const contextCondition = contextQuery.sql.replace('SELECT MAX(sequence_number) AS max_seq FROM events WHERE ', '');
    
    // Calculate parameter positions for insert values
    const contextParamCount = contextQuery.params.length;
    const eventTypesParam = contextParamCount + 1;
    const payloadsParam = contextParamCount + 2;
    const metadataParam = contextParamCount + 3;

    return `
      WITH context AS (
        SELECT MAX(sequence_number) AS max_seq
        FROM events
        WHERE ${contextCondition}
      )
      INSERT INTO events (event_type, payload, metadata)
      SELECT unnest($${eventTypesParam}::text[]), unnest($${payloadsParam}::jsonb[]), unnest($${metadataParam}::jsonb[])
      FROM context
      WHERE COALESCE(max_seq, 0) = ${expectedMaxSeq}
    `;
  }

  private deserializeEvent<T extends IHasEventType>(row: any): T {
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    return {
      ...payload,
      event_type: row.event_type,
      sequenceNumber: row.sequence_number,
      occurredAt: row.occurred_at
    } as T;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async migrate(): Promise<void> {
    await this.createTables();
  }

  async createTables(): Promise<void> {
    await this.ensureDatabaseExists();

    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS events (
          sequence_number BIGSERIAL PRIMARY KEY,
          occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          event_type TEXT NOT NULL,
          payload JSONB NOT NULL,
          metadata JSONB NOT NULL DEFAULT '{}'
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_events_payload_gin ON events USING gin(payload)
      `);
    } finally {
      client.release();
    }
  }

  private async ensureDatabaseExists(): Promise<void> {
    const adminConnectionString = this.changeDatabaseInConnectionString(
      process.env.DATABASE_URL!, 
      'postgres'
    );
    
    const adminPool = new Pool({ connectionString: adminConnectionString });
    const client = await adminPool.connect();
    
    try {
      await client.query(`CREATE DATABASE ${this.dbName}`);
      console.log(`Database created: ${this.dbName}`);
    } catch (err: any) {
      if (err.code === '42P04') { // already exists
        console.log(`Database already exists: ${this.dbName}`);
      } else {
        throw err;
      }
    } finally {
      client.release();
      await adminPool.end();
    }
  }

  private changeDatabaseInConnectionString(connStr: string, newDbName: string): string {
    const url = new URL(connStr);
    url.pathname = `/${newDbName}`;
    return url.toString();
  }

  private getDatabaseNameFromConnectionString(connStr: string): string | null {
    try {
      const url = new URL(connStr);
      const dbName = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
      return dbName || null;
    } catch (err) {
      console.error('Invalid connection string:', err);
      return null;
    }
  }
  
}