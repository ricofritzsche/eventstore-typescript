import { 
  createDatabaseQuery,
  changeDatabaseInConnectionString,
  getDatabaseNameFromConnectionString,
  CREATE_EVENTS_TABLE,
  CREATE_EVENT_TYPE_INDEX,
  CREATE_OCCURRED_AT_INDEX,
  CREATE_PAYLOAD_GIN_INDEX
} from '../schema';

describe('Schema Functions', () => {
  describe('createDatabaseQuery', () => {
    it('should create database query string', () => {
      const result = createDatabaseQuery('testdb');
      expect(result).toBe('CREATE DATABASE testdb');
    });
  });

  describe('changeDatabaseInConnectionString', () => {
    it('should change database name in connection string', () => {
      const connStr = 'postgresql://user:pass@localhost:5432/olddb';
      const result = changeDatabaseInConnectionString(connStr, 'newdb');
      expect(result).toBe('postgresql://user:pass@localhost:5432/newdb');
    });

    it('should handle connection string without port', () => {
      const connStr = 'postgresql://user:pass@localhost/olddb';
      const result = changeDatabaseInConnectionString(connStr, 'newdb');
      expect(result).toBe('postgresql://user:pass@localhost/newdb');
    });
  });

  describe('getDatabaseNameFromConnectionString', () => {
    it('should extract database name from connection string', () => {
      const connStr = 'postgresql://user:pass@localhost:5432/myapp';
      const result = getDatabaseNameFromConnectionString(connStr);
      expect(result).toBe('myapp');
    });

    it('should handle connection string with trailing slash', () => {
      const connStr = 'postgresql://user:pass@localhost:5432/myapp/';
      const result = getDatabaseNameFromConnectionString(connStr);
      expect(result).toBe('myapp/');
    });

    it('should return null for invalid connection string', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      const connStr = 'invalid-connection-string';
      const result = getDatabaseNameFromConnectionString(connStr);
      expect(result).toBe(null);
      consoleSpy.mockRestore();
    });

    it('should return null for connection string without database', () => {
      const connStr = 'postgresql://user:pass@localhost:5432/';
      const result = getDatabaseNameFromConnectionString(connStr);
      expect(result).toBe(null);
    });
  });

  describe('SQL Constants', () => {
    it('should define events table creation SQL', () => {
      expect(CREATE_EVENTS_TABLE).toContain('CREATE TABLE IF NOT EXISTS events');
      expect(CREATE_EVENTS_TABLE).toContain('sequence_number BIGSERIAL PRIMARY KEY');
      expect(CREATE_EVENTS_TABLE).toContain('event_type TEXT NOT NULL');
      expect(CREATE_EVENTS_TABLE).toContain('payload JSONB NOT NULL');
    });

    it('should define index creation SQL', () => {
      expect(CREATE_EVENT_TYPE_INDEX).toContain('idx_events_type');
      expect(CREATE_OCCURRED_AT_INDEX).toContain('idx_events_occurred_at');
      expect(CREATE_PAYLOAD_GIN_INDEX).toContain('idx_events_payload_gin');
      expect(CREATE_PAYLOAD_GIN_INDEX).toContain('USING gin(payload)');
    });
  });
});