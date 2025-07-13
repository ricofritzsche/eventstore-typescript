import { Pool } from 'pg';
import { EventStore, EventFilter, HasEventType, QueryResult } from '../types';
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

export interface PostgresEventStoreOptions {
  connectionString?: string;
}

export class PostgresEventStore implements EventStore {
  private pool: Pool;
  private readonly databaseName: string;

  constructor(options: PostgresEventStoreOptions = {}) {
    const connectionString = options.connectionString || process.env.DATABASE_URL;
    if (!connectionString) throw new Error('Connection string missing. DATABASE_URL environment variable not set.');

    const databaseNameFromConnectionString = getDatabaseNameFromConnectionString(connectionString);
    if (!databaseNameFromConnectionString) throw new Error('Database name not found. Invalid connection string: ' + connectionString);
    this.databaseName = databaseNameFromConnectionString;

    this.pool = new Pool({ connectionString });
  }

  async query<T extends HasEventType>(filter: EventFilter): Promise<QueryResult<T>> {
    const client = await this.pool.connect();
    try {
      const query = buildContextQuery(filter);
      const result = await client.query(query.sql, query.params);

      return { 
        events: mapRecordsToEvents<T>(result), 
        maxSequenceNumber: extractMaxSequenceNumber(result) 
      };
    } finally {
      client.release();
    }
  }

  async append<T extends HasEventType>(filter: EventFilter, events: T[], expectedMaxSequence: number): Promise<void> {
    if (events.length === 0) return;

    const client = await this.pool.connect();
    try {
      const cteQuery = buildCteInsertQuery(filter, expectedMaxSequence);
      const params = prepareInsertParams(events, cteQuery.params);

      const result = await client.query(cteQuery.sql, params);

      if (result.rowCount === 0) {
        throw new Error('Context changed: events were modified between query() and append()');
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
        console.log(`Database already exists: ${this.databaseName}`);
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