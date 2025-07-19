import { Pool } from 'pg';
import { Event, EventStore, EventFilter, QueryResult } from '../types';
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
import { createFilter } from '../filter';

const NON_EXISTENT_EVENT_TYPE = '__NON_EXISTENT__' + Math.random().toString(36);

export interface PostgresEventStoreOptions {
  connectionString?: string;
  eventStream?: EventStreamNotifier;
}

export interface EventStreamNotifier {
  dispatch(events: Event[]): Promise<void>;
}


export class PostgresEventStore implements EventStore {
  private pool: Pool;
  private readonly databaseName: string;
  private readonly eventStream?: EventStreamNotifier;

  constructor(options: PostgresEventStoreOptions = {}) {
    const connectionString = options.connectionString || process.env.DATABASE_URL;
    if (!connectionString) throw new Error('err02: Connection string missing. DATABASE_URL environment variable not set.');

    const databaseNameFromConnectionString = getDatabaseNameFromConnectionString(connectionString);
    if (!databaseNameFromConnectionString) throw new Error('err03: Database name not found. Invalid connection string: ' + connectionString);
    this.databaseName = databaseNameFromConnectionString;

    this.pool = new Pool({ connectionString });
    if (options.eventStream) {
      this.eventStream = options.eventStream;
    }
  }

  async query(filter: EventFilter): Promise<QueryResult> {
    const client = await this.pool.connect();
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


  async append(events: Event[], filter?: EventFilter,  expectedMaxSequenceNumber?: number): Promise<void> {
    if (events.length === 0) return;

    if (filter === undefined || filter.eventTypes.length === 0) {
      filter = createFilter([NON_EXISTENT_EVENT_TYPE]);
      expectedMaxSequenceNumber = 0;
    }

    if (expectedMaxSequenceNumber === undefined)
      throw new Error('err04: Expected max sequence number is required when a filter is provided!')

    const client = await this.pool.connect();
    try {
      const cteQuery = buildCteInsertQuery(filter, expectedMaxSequenceNumber);
      const params = prepareInsertParams(events, cteQuery.params);

      const result = await client.query(cteQuery.sql, params);

      if (result.rowCount === 0) {
        throw new Error('err05: Context changed: events were modified between query() and append()');
      }

      if (this.eventStream) {
        await this.eventStream.dispatch(events);
      }

    } finally {
      client.release();
    }
  }

  async initializeDatabase(): Promise<void> {
    await this.createDatabase();
    await this.createTableAndIndexes();
  }

  async close(): Promise<void> {
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
        console.log(`err06: Database already exists: ${this.databaseName}`);
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