import { Event, EventStore, EventFilter, QueryResult, EventStreamNotifier, HandleEvents, EventSubscription } from '../../types.ts';
import { buildCteInsertQuery } from './insert.ts';
import { buildContextQuery } from './query.ts';
import { mapRecordsToEvents, extractMaxSequenceNumber, prepareInsertParams } from './transform.ts';
import { 
  CREATE_EVENTS_TABLE, 
  CREATE_EVENT_TYPE_INDEX, 
  CREATE_OCCURRED_AT_INDEX, 
  CREATE_PAYLOAD_GIN_INDEX,
  createDatabaseQuery,
  changeDatabaseInConnectionString,
  getDatabaseNameFromConnectionString
} from './schema.ts';
import { createFilter } from '../../filter/mod.ts';
import { MemoryEventStreamNotifier } from '../../notifiers/memory/mod.ts';

// Universal database interfaces for Deno
interface UniversalClient {
  query(sql: string, params?: any[]): Promise<any>;
  release(): void;
}

interface UniversalPool {
  connect(): Promise<UniversalClient>;
  end(): Promise<void>;
}

// Runtime detection and dynamic pool creation
async function createUniversalPool(connectionString: string): Promise<UniversalPool> {
  // @ts-ignore: Deno global check
  if (typeof Deno !== 'undefined') {
    // Deno environment - use postgres library
    const postgres = await import('postgres');
    const sql = postgres.default(connectionString);
    
    // Adapt postgres client to UniversalPool interface
    return {
      connect: async () => ({
        query: async (sqlQuery: string, params?: any[]) => {
          const result = await sql.unsafe(sqlQuery, params || []);
          return { rows: result, rowCount: result.length };
        },
        release: () => {} // postgres library handles connections automatically
      }),
      end: async () => await sql.end()
    };
  } else {
    // Node.js environment - use pg
    const { Pool } = await import('pg');
    return new Pool({ connectionString });
  }
}

const NON_EXISTENT_EVENT_TYPE = '__NON_EXISTENT__' + Math.random().toString(36);

export interface PostgresEventStoreOptions {
  connectionString?: string;
  notifier?: EventStreamNotifier;
}

/**
 * Universal PostgreSQL event store implementation for Deno with runtime detection.
 */
export class PostgresEventStore implements EventStore {
  private pool: UniversalPool;
  private readonly databaseName: string;
  private readonly notifier: EventStreamNotifier;
  private readonly connectionString: string;

  constructor(options: PostgresEventStoreOptions = {}) {
    // @ts-ignore: Universal environment handling
    this.connectionString = options.connectionString || 
      (typeof process !== 'undefined' ? process.env?.DATABASE_URL : 
       // @ts-ignore: Deno global
       typeof Deno !== 'undefined' ? Deno.env.get('DATABASE_URL') : '') || '';
    
    if (!this.connectionString) {
      throw new Error('eventstore-stores-postgres-err02: Connection string missing. DATABASE_URL environment variable not set.');
    }

    const databaseNameFromConnectionString = getDatabaseNameFromConnectionString(this.connectionString);
    if (!databaseNameFromConnectionString) {
      throw new Error('eventstore-stores-postgres-err03: Database name not found. Invalid connection string: ' + this.connectionString);
    }
    this.databaseName = databaseNameFromConnectionString;

    // Pool will be initialized lazily
    this.pool = null as any;
    this.notifier = options.notifier ?? new MemoryEventStreamNotifier();
  }

  private async ensurePool(): Promise<UniversalPool> {
    if (!this.pool) {
      this.pool = await createUniversalPool(this.connectionString);
    }
    return this.pool;
  }

  async query(filter: EventFilter): Promise<QueryResult> {
    const pool = await this.ensurePool();
    const client = await pool.connect();
    try {
      const query = buildContextQuery(filter);
      const result = await client.query(query.sql, query.params);

      return { 
        events: mapRecordsToEvents(result), 
        maxSequenceNumber: extractMaxSequenceNumber(result) 
      };
    } finally {
      client.release();
    }
  }

  async subscribe(handle: HandleEvents): Promise<EventSubscription> {
    return this.notifier.subscribe(handle);
  }

  async append(events: Event[], filter?: EventFilter, expectedMaxSequenceNumber?: number): Promise<void> {
    if (events.length === 0) return;

    if (filter === undefined || filter.eventTypes.length === 0) {
      filter = createFilter([NON_EXISTENT_EVENT_TYPE]);
      expectedMaxSequenceNumber = 0;
    }

    if (expectedMaxSequenceNumber === undefined) {
      throw new Error('eventstore-stores-postgres-err04: Expected max sequence number is required when a filter is provided!');
    }

    const pool = await this.ensurePool();
    const client = await pool.connect();
    try {
      const cteQuery = buildCteInsertQuery(filter, expectedMaxSequenceNumber);
      const params = prepareInsertParams(events, cteQuery.params);

      const result = await client.query(cteQuery.sql, params);

      if (result.rowCount === 0) {
        throw new Error('eventstore-stores-postgres-err05: Context changed: events were modified between query() and append()');
      }

      const insertedEvents = mapRecordsToEvents(result);
      await this.notifier.notify(insertedEvents);

    } finally {
      client.release();
    }
  }

  async initializeDatabase(): Promise<void> {
    await this.createDatabase();
    await this.createTableAndIndexes();
  }

  async close(): Promise<void> {
    await this.notifier.close();
    if (this.pool) {
      await this.pool.end();
    }
  }

  private async createDatabase(): Promise<void> {
    const adminConnectionString = changeDatabaseInConnectionString(
      this.connectionString, 
      'postgres'
    );
    
    const adminPool = await createUniversalPool(adminConnectionString);
    const client = await adminPool.connect();
    
    try {
      await client.query(createDatabaseQuery(this.databaseName));
      console.log(`Database created: ${this.databaseName}`);
    } catch (err: any) {
      if (err.code === '42P04') {
        console.log(`eventstore-stores-postgres-err06: Database already exists: ${this.databaseName}`);
      } else {
        throw err;
      }
    } finally {
      client.release();
      await adminPool.end();
    }
  }

  private async createTableAndIndexes(): Promise<void> {
    const pool = await this.ensurePool();
    const client = await pool.connect();
    try {
      await client.query(CREATE_EVENTS_TABLE);
      await client.query(CREATE_EVENT_TYPE_INDEX);
      await client.query(CREATE_OCCURRED_AT_INDEX);
      await client.query(CREATE_PAYLOAD_GIN_INDEX);
    } finally {
      client.release();
    }
  }
}