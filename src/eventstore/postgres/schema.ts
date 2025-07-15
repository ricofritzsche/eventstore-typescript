export const CREATE_EVENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS events (
    sequence_number BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    event_version TEXT NOT NULL DEFAULT '1.0',
    payload JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'
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

export function createDatabaseQuery(dbName: string): string {
  return `CREATE DATABASE ${dbName}`;
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
    console.error('Invalid connection string:', err);
    return null;
  }
}