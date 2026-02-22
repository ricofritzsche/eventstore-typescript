import { MongoClient, Db, Collection } from 'mongodb';

export const EVENTS_COLLECTION_NAME = 'events';

export interface EventDocument {
  _id?: number; // sequence_number (auto-incrementing)
  sequence_number: number;
  occurred_at: Date;
  event_type: string;
  payload: Record<string, unknown>;
}

/**
 * Creates the events collection if it doesn't exist
 */
export async function createEventsCollection(db: Db): Promise<Collection<EventDocument>> {
  const collection = db.collection<EventDocument>(EVENTS_COLLECTION_NAME);
  
  // Create collection if it doesn't exist (MongoDB creates it automatically on first insert)
  // But we'll ensure it exists explicitly
  const collections = await db.listCollections({ name: EVENTS_COLLECTION_NAME }).toArray();
  if (collections.length === 0) {
    await db.createCollection(EVENTS_COLLECTION_NAME);
  }
  
  return collection;
}

/**
 * Creates indexes for fast event queries
 */
export async function createIndexes(collection: Collection<EventDocument>): Promise<void> {
  // Index on event_type for filtering by event type
  await collection.createIndex({ event_type: 1 }, { name: 'idx_events_type' });
  
  // Index on occurred_at for time-based queries
  await collection.createIndex({ occurred_at: 1 }, { name: 'idx_events_occurred_at' });
  
  // Index on sequence_number (should already be unique via _id, but explicit for clarity)
  await collection.createIndex({ sequence_number: 1 }, { unique: true, name: 'idx_events_sequence_number' });
  
  // Text index on payload for content searches (MongoDB's equivalent to GIN index)
  // Note: This is a simplified approach - for complex JSON queries, consider using MongoDB's $jsonSchema
  await collection.createIndex({ payload: 1 }, { name: 'idx_events_payload' });
}

/**
 * Gets the database name from a MongoDB connection string
 */
export function getDatabaseNameFromConnectionString(connectionString: string): string | null {
  try {
    const url = new URL(connectionString);
    const dbName = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    return dbName || null;
  } catch (err) {
    console.error('eventstore-stores-mongodb-err01: Invalid connection string:', err);
    return null;
  }
}

/**
 * Changes the database name in a MongoDB connection string
 */
export function changeDatabaseInConnectionString(connectionString: string, newDbName: string): string {
  const url = new URL(connectionString);
  url.pathname = `/${newDbName}`;
  return url.toString();
}

