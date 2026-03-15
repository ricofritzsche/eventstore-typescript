export const CREATE_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS events (
    sequence_number BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL
  )
`;

export const CREATE_EVENT_TYPE_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)
`;

export const CREATE_OCCURRED_AT_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events(occurred_at)
`;

export const CREATE_PAYLOAD_GIN_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_events_payload_gin ON events USING gin(payload)
`;

function quoteIdentifier(identifier: string): string {
  if (identifier.length === 0) {
    throw new Error('eventstore-stores-postgres-err07: Database name must not be empty');
  }
  if (identifier.includes('\u0000')) {
    throw new Error('eventstore-stores-postgres-err08: Database name must not contain null bytes');
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function createDatabaseQuery(dbName: string): string {
  return `CREATE DATABASE ${quoteIdentifier(dbName)}`;
}

export function changeDatabaseInConnectionString(connStr: string, newDbName: string): string {
  const url = new URL(connStr);
  url.pathname = `/${newDbName}`;
  return url.toString();
}

export function getDatabaseNameFromConnectionString(connStr: string): string | null {
  try {
    const url = new URL(connStr);
    const dbName = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    return dbName || null;
  } catch (err) {
    console.error('eventstore-stores-postgres-err01: Invalid connection string:', err);
    return null;
  }
}
