import { buildContextQuery, buildContextVersionQuery } from '../query';
import { createFilter } from '../../../filter';

describe('Query Builder', () => {
  describe('buildContextQuery', () => {
    it('should build basic query with event types only', () => {
      const filter = createFilter(['AccountCreated', 'AccountUpdated']);

      const result = buildContextQuery(filter);

      expect(result.sql).toBe('SELECT * FROM events WHERE event_type = ANY($1) ORDER BY sequence_number ASC');
      expect(result.params).toEqual([['AccountCreated', 'AccountUpdated']]);
    });

    it('should build query with payload predicates', () => {
      const filter = createFilter(['AccountCreated'], [{ accountId: '123', active: true }]);

      const result = buildContextQuery(filter);

      expect(result.sql).toBe('SELECT * FROM events WHERE event_type = ANY($1) AND (payload @> $2) ORDER BY sequence_number ASC');
      expect(result.params).toEqual([
        ['AccountCreated'],
        JSON.stringify({ accountId: '123', active: true })
      ]);
    });

    it('should build query with multiple payload predicate options', () => {
      const filter = createFilter(['AccountCreated'], [
        { status: 'active' },
        { status: 'pending' }
      ]);

      const result = buildContextQuery(filter);

      expect(result.sql).toBe('SELECT * FROM events WHERE event_type = ANY($1) AND (payload @> $2 OR payload @> $3) ORDER BY sequence_number ASC');
      expect(result.params).toEqual([
        ['AccountCreated'],
        JSON.stringify({ status: 'active' }),
        JSON.stringify({ status: 'pending' })
      ]);
    });

    it('should build query with multiple payload predicates', () => {
      const filter = createFilter(['AccountCreated'], [
        { accountId: '123' },
        { status: 'active' },
        { status: 'pending' }
      ]);

      const result = buildContextQuery(filter);

      expect(result.sql).toBe('SELECT * FROM events WHERE event_type = ANY($1) AND (payload @> $2 OR payload @> $3 OR payload @> $4) ORDER BY sequence_number ASC');
      expect(result.params).toEqual([
        ['AccountCreated'],
        JSON.stringify({ accountId: '123' }),
        JSON.stringify({ status: 'active' }),
        JSON.stringify({ status: 'pending' })
      ]);
    });
  });

  describe('buildContextVersionQuery', () => {
    it('should build version query conditions without ORDER BY', () => {
      const filter = createFilter(['AccountCreated'], [{ accountId: '123' }]);

      const result = buildContextVersionQuery(filter);

      expect(result.sql).toBe('event_type = ANY($1) AND (payload @> $2)');
      expect(result.params).toEqual([
        ['AccountCreated'],
        JSON.stringify({ accountId: '123' })
      ]);
    });

    it('should handle empty payload predicates', () => {
      const filter = createFilter(['AccountCreated'], []);

      const result = buildContextVersionQuery(filter);

      expect(result.sql).toBe('event_type = ANY($1)');
      expect(result.params).toEqual([['AccountCreated']]);
    });
  });
});