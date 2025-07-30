import { Event, EventStore, EventFilter, QueryResult, EventStreamNotifier, HandleEvents, EventSubscription, EventQuery } from '../../types';
import { buildCteInsertQuery } from './insert';
import { buildContextQuery } from './query';
import { mapRecordsToEvents, extractMaxSequenceNumber, prepareInsertParams } from './transform';
import { 
  CREATE_EVENTS_TABLE, 
  CREATE_EVENT_TYPE_INDEX, 
  CREATE_OCCURRED_AT_INDEX, 
  CREATE_PAYLOAD_GIN_INDEX,
  createDatabaseQuery,
  changeDatabaseInConnectionString,
  getDatabaseNameFromConnectionString
} from './schema';
import { createFilter, } from '../../filter';
import { MemoryEventStreamNotifier } from '../../notifiers';

import { Pool } from 'pg';

const NON_EXISTENT_EVENT_TYPE = '__NON_EXISTENT__' + Math.random().toString(36);

export interface PostgresEventStoreOptions {
  connectionString?: string;
  notifier?: EventStreamNotifier;
}


/**
 * Represents an implementation of an event store using Postgres as the underlying database.
 * Provides functionality to append events, query events, and manage database initialization.
 * Additionally, it facilitates event subscriptions through an event stream notifier mechanism.
 */
export class PostgresEventStore implements EventStore {
  private pool: Pool;
  private readonly databaseName: string;
  private readonly notifier: EventStreamNotifier;

  constructor(options: PostgresEventStoreOptions = {}) {
    const connectionString = options.connectionString || process.env.DATABASE_URL;
    if (!connectionString) throw new Error('eventstore-stores-postgres-err02: Connection string missing. DATABASE_URL environment variable not set.');

    const databaseNameFromConnectionString = getDatabaseNameFromConnectionString(connectionString);
    if (!databaseNameFromConnectionString) throw new Error('eventstore-stores-postgres-err03: Database name not found. Invalid connection string: ' + connectionString);
    this.databaseName = databaseNameFromConnectionString;

    this.pool = new Pool({ connectionString });
    // This is the "Default" EventStreamNotifier, but allow override
    this.notifier = options.notifier ?? new MemoryEventStreamNotifier();
  }

  async query(query: EventQuery): Promise<QueryResult> {
    const client = await this.pool.connect();
    try {
      const query = buildContextQuery(query);
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


  async append(events: Event[], query?: EventQuery,  expectedMaxSequenceNumber?: number): Promise<void> {
    if (events.length === 0) return;

    if (query === undefined || query.filters.length === 0) {
      query = createQuery(createFilter([NON_EXISTENT_EVENT_TYPE]));
      expectedMaxSequenceNumber = 0;
    }

    if (expectedMaxSequenceNumber === undefined)
      throw new Error('eventstore-stores-postgres-err04: Expected max sequence number is required when a filter is provided!')

    const client = await this.pool.connect();
    try {
      const cteQuery = buildCteInsertQuery(query, expectedMaxSequenceNumber);
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
    await this.pool.end();
  }

  private async createDatabase(): Promise<void> {
    const adminConnectionString = changeDatabaseInConnectionString(
      process.env.DATABASE_URL!, 
      'postgres'
    );
    
    const adminPool = new Pool({ connectionString: adminConnectionString });
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
    const client = await this.pool.connect();
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