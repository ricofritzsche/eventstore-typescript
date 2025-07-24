import { Event, EventStore, EventFilter, QueryResult, EventStreamNotifier, HandleEvents, EventSubscription } from '../../types.ts';
import { buildCteInsertQuery } from './insert_deno.ts';
import { buildContextQuery } from './query_deno.ts';
import { mapRecordsToEvents, extractMaxSequenceNumber, prepareInsertParams } from './transform_deno.ts';
import { 
  CREATE_EVENTS_TABLE, 
  CREATE_EVENT_TYPE_INDEX, 
  CREATE_OCCURRED_AT_INDEX, 
  CREATE_PAYLOAD_GIN_INDEX,
  createDatabaseQuery,
  changeDatabaseInConnectionString,
  getDatabaseNameFromConnectionString
} from './schema_deno.ts';
import { createFilter } from '../../filter_deno.ts';
import { MemoryEventStreamNotifier } from '../../notifiers/memory/mod.ts';

// Universal database interfaces
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
  // @ts-ignore: Check for Deno runtime
  if (typeof Deno !== 'undefined') {
    // Deno environment - use postgres from npm
    const { Pool } = await import('postgres');
    return new Pool(connectionString);
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
 * Represents an implementation of an event store using Postgres as the underlying database.
 * Provides functionality to append events, query events, and manage database initialization.
 * Additionally, it facilitates event subscriptions through an event stream notifier mechanism.
 * Works in both Node.js and Deno environments.
 */
export class PostgresEventStore implements EventStore {
  private pool: UniversalPool;
  private readonly databaseName: string;
  private readonly notifier: EventStreamNotifier;
  private readonly connectionString: string;

  constructor(options: PostgresEventStoreOptions = {}) {
    // @ts-ignore: Deno and Node.js env handling
    this.connectionString = options.connectionString || (typeof process !== 'undefined' ? process.env?.DATABASE_URL : Deno.env.get('DATABASE_URL')) || '';
    if (!this.connectionString) throw new Error('eventstore-stores-postgres-err02: Connection string missing. DATABASE_URL environment variable not set.');

    const databaseNameFromConnectionString = getDatabaseNameFromConnectionString(this.connectionString);
    if (!databaseNameFromConnectionString) throw new Error('eventstore-stores-postgres-err03: Database name not found. Invalid connection string: ' + this.connectionString);
    this.databaseName = databaseNameFromConnectionString;

    // Pool will be initialized lazily
    this.pool = null as any;
    // This is the "Default" EventStreamNotifier, but allow override
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


  async append(events: Event[], filter?: EventFilter,  expectedMaxSequenceNumber?: number): Promise<void> {
    if (events.length === 0) return;

    if (filter === undefined || filter.eventTypes.length === 0) {
      filter = createFilter([NON_EXISTENT_EVENT_TYPE]);
      expectedMaxSequenceNumber = 0;
    }

    if (expectedMaxSequenceNumber === undefined)
      throw new Error('eventstore-stores-postgres-err04: Expected max sequence number is required when a filter is provided!')

    const pool = await this.ensurePool();
    const client = await pool.connect();
    try {
      const cteQuery = buildCteInsertQuery(filter, expectedMaxSequenceNumber);
      const params = prepareInsertParams(events, cteQuery.params);

      const result = await client.query(cteQuery.sql, params);

      if (result.rowCount === 0) {
        throw new Error('eventstore-stores-postgres-err05: Context changed: events were modified between query() and append()');
      }

      // Convert inserted records to EventRecord[] and notify subscribers
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