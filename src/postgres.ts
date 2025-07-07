import { Pool, PoolClient } from 'pg';
import { IEventStore, EventFilter, HasEventType, EventRecord, EventStoreOptions } from './types';

export class PostgresEventStore implements IEventStore {
  private pool: Pool;
  private dbName: string;
  private adminPool: Pool

  constructor(options: EventStoreOptions = {}) {
    const connectionString = options.connectionString || 
      process.env.DATABASE_URL || 
      'postgres://postgres:postgres@localhost:5432/eventstore';

    this.dbName = this.getDatabaseNameFromConnectionString(connectionString) || 'eventstore';
    
    console.log(connectionString)
    this.pool = new Pool({ connectionString });

    const adminConnectionString = this.changeDatabaseInConnectionString(connectionString, 'postgres');
    this.adminPool = new Pool({ connectionString: adminConnectionString });
  }

  async query<T extends HasEventType>(filter: EventFilter): Promise<T[]> {
    const client = await this.pool.connect();
    try {
      let query = 'SELECT * FROM events WHERE event_type = ANY($1)';
      const params: unknown[] = [filter.eventTypes];

      if (filter.payloadPredicates && Object.keys(filter.payloadPredicates).length > 0) {
        query += ' AND payload @> $2';
        params.push(JSON.stringify(filter.payloadPredicates));
      }

      query += ' ORDER BY sequence_number ASC';

      const result = await client.query(query, params);
      
      return result.rows.map(row => this.deserializeEvent<T>(row));
    } finally {
      client.release();
    }
  }

  async append<T extends HasEventType>(filter: EventFilter, events: T[]): Promise<void> {
    if (events.length === 0) return;

    const client = await this.pool.connect();
    try {
      const contextQuery = this.buildContextQuery(filter);
      const contextResult = await client.query(contextQuery.sql, contextQuery.params);
      const expectedMaxSeq = contextResult.rows[0]?.max_seq || 0;

      const eventTypes: string[] = [];
      const payloads: string[] = [];
      const metadatas: string[] = [];

      for (const event of events) {
        eventTypes.push(event.eventType());
        payloads.push(JSON.stringify(event));
        metadatas.push(JSON.stringify({
          version: event.eventVersion?.() || '1.0'
        }));
      }

      const cteQuery = this.buildCteInsertQuery(filter, expectedMaxSeq);
      const params = [
        filter.eventTypes,                                    // $1: event types for context check
        filter.payloadPredicates ? JSON.stringify(filter.payloadPredicates) : '{}', // $2: payload predicates
        expectedMaxSeq,                                       // $3: expected max sequence
        eventTypes,                                           // $4: event types to insert
        payloads,                                             // $5: payloads to insert
        metadatas                                             // $6: metadata to insert
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

  private buildContextQuery(filter: EventFilter): { sql: string; params: unknown[] } {
    let sql = 'SELECT MAX(sequence_number) AS max_seq FROM events WHERE event_type = ANY($1)';
    const params: unknown[] = [filter.eventTypes];

    if (filter.payloadPredicates && Object.keys(filter.payloadPredicates).length > 0) {
      sql += ' AND payload @> $2';
      params.push(JSON.stringify(filter.payloadPredicates));
    }

    return { sql, params };
  }

  private buildCteInsertQuery(filter: EventFilter, expectedMaxSeq: number): string {
    const hasPayloadPredicates = filter.payloadPredicates && Object.keys(filter.payloadPredicates).length > 0;
    
    let cteCondition = 'event_type = ANY($1)';
    if (hasPayloadPredicates) {
      cteCondition += ' AND payload @> $2';
    }

    return `
      WITH context AS (
        SELECT MAX(sequence_number) AS max_seq
        FROM events
        WHERE ${cteCondition}
      )
      INSERT INTO events (event_type, payload, metadata)
      SELECT unnest($4::text[]), unnest($5::jsonb[]), unnest($6::jsonb[])
      FROM context
      WHERE COALESCE(max_seq, 0) = $3
    `;
  }

  private deserializeEvent<T extends HasEventType>(row: EventRecord): T {
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    return {
      ...payload,
      sequenceNumber: row.sequenceNumber,
      occurredAt: row.occurredAt
    } as T;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createTables(): Promise<void> {
    const adminClient = await this.adminPool.connect();
    try {
      await adminClient.query(`CREATE DATABASE ${this.dbName}`);
      console.log(`Database created: ${this.dbName}`);
    } catch (err: any) {
      if (err.code === '42P04') { // already exists
        console.log(`Database already exists: ${this.dbName}`);
      } else {
        throw err;
      }
    } finally {
      adminClient.release();
    }

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