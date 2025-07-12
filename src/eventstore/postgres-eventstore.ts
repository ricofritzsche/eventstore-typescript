import { Pool, QueryResult } from 'pg';
import { buildContextQuery, buildCteInsertQuery } from "./postgres-core";
import { IEventStore, IEventFilter, IHasEventType, IQueryResult, IEventRecord } from './types';


export interface IPostgresEventStoreOptions {
  connectionString?: string;
}


export class PostgresEventStore implements IEventStore {
  private pool: Pool;
  private readonly dbName: string;

  constructor(options: IPostgresEventStoreOptions = {}) {
    const connectionString = options.connectionString || process.env.DATABASE_URL;
    if (!connectionString) throw new Error('Connection string missing. DATABASE_URL environment variable not set.');

    const dbName = PostgresEventStore.getDatabaseNameFromConnectionString(connectionString);
    if (!dbName) throw new Error('Database name not found. Invalid connection string: ' + connectionString);
    this.dbName = dbName;

    this.pool = new Pool({ connectionString });
  }


  async query<T extends IHasEventType>(filter: IEventFilter): Promise<IQueryResult<T>> {
    const client = await this.pool.connect();
    try {
      let query = buildContextQuery(filter);

      const result = await client.query(query.sql, query.params);

      return { 
        events: mapRecordsToEvents(result), 
        maxSequenceNumber: maxSequenceNumber(result) 
      };
    } finally {
      client.release();
    }

    function mapRecordsToEvents(result:QueryResult<any>): T[] {
      return result.rows.map(row => PostgresEventStore.deserializeEvent<T>(row));
    }

    function maxSequenceNumber(result:QueryResult<any>):number {
      const lastRow = result.rows[result.rows.length - 1];
      const maxSequenceNumber = lastRow ? parseInt(lastRow.sequence_number, 10) : 0;
      return maxSequenceNumber;
    }
  }


  async append<T extends IHasEventType>(filter: IEventFilter, events: T[], expectedMaxSequence: number): Promise<void> {
    if (events.length === 0) return;

    const client = await this.pool.connect();
    try {
      const cteQuery = buildCteInsertQuery(filter, expectedMaxSequence);
      const params = prepareCteInsertQueryParams(cteQuery.params);

      const result = await client.query(cteQuery.sql, params);

      if (result.rowCount === 0) {
        throw new Error('Context changed: events were modified between query() and append()');
      }

    } catch (error) {
      throw error;
    } finally {
      client.release();
    }


    function prepareCteInsertQueryParams(queryParams: unknown[]) {
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

      const params = [
        ...queryParams, // Context parameters (dynamic based on filter)
        eventTypes, // Event types to insert
        payloads, // Payloads to insert
        metadata // Metadata to insert
      ];
      return params;
    }
  }


  async initializeDatabase(): Promise<void> {
    await this.createDatabase();
    await this.createTableAndIndexes();
  }


  async close(): Promise<void> {
    await this.pool.end();
  }



  static deserializeEvent<T extends IHasEventType>(row: any): T {
    const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
    return {
      ...payload,
      event_type: row.event_type,
      sequenceNumber: row.sequence_number,
      occurredAt: row.occurred_at
    } as T;
  }


  private async createDatabase(): Promise<void> {
    const adminConnectionString = PostgresEventStore.changeDatabaseInConnectionString(
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

  private async createTableAndIndexes() {
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


  private static changeDatabaseInConnectionString(connStr: string, newDbName: string): string {
    const url = new URL(connStr);
    url.pathname = `/${newDbName}`;
    return url.toString();
  }

  private static getDatabaseNameFromConnectionString(connStr: string): string | null {
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