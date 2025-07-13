import { buildCteInsertQuery } from '../insert';
import { createFilter } from '../../filter';

describe('Insert Query Builder', () => {
  describe('buildCteInsertQuery', () => {
    it('should build CTE insert query with basic filter', () => {
      const filter = createFilter(['AccountCreated']);
      const expectedMaxSeq = 5;

      const result = buildCteInsertQuery(filter, expectedMaxSeq);

      expect(result.sql.trim()).toBe(`
    WITH context AS (
      SELECT MAX(sequence_number) AS max_seq
      FROM events
      WHERE event_type = ANY($1)
    )
    INSERT INTO events (event_type, payload, metadata)
    SELECT unnest($2::text[]), unnest($3::jsonb[]), unnest($4::jsonb[])
    FROM context
    WHERE COALESCE(max_seq, 0) = 5
  `.trim());
      expect(result.params).toEqual([['AccountCreated']]);
    });

    it('should build CTE insert query with payload predicates', () => {
      const filter = createFilter(['AccountCreated'], [{ accountId: '123' }]);
      const expectedMaxSeq = 10;

      const result = buildCteInsertQuery(filter, expectedMaxSeq);

      expect(result.sql.includes('WHERE event_type = ANY($1) AND (payload @> $2)')).toBe(true);
      expect(result.sql.includes('WHERE COALESCE(max_seq, 0) = 10')).toBe(true);
      expect(result.params).toEqual([
        ['AccountCreated'],
        JSON.stringify({ accountId: '123' })
      ]);
    });

    it('should build CTE insert query with multiple payload predicate options', () => {
      const filter = createFilter(['AccountCreated'], [
        { status: 'active' },
        { status: 'pending' }
      ]);
      const expectedMaxSeq = 0;

      const result = buildCteInsertQuery(filter, expectedMaxSeq);

      expect(result.sql.includes('(payload @> $2 OR payload @> $3)')).toBe(true);
      expect(result.sql.includes('WHERE COALESCE(max_seq, 0) = 0')).toBe(true);
      expect(result.params).toEqual([
        ['AccountCreated'],
        JSON.stringify({ status: 'active' }),
        JSON.stringify({ status: 'pending' })
      ]);
    });

    it('should handle zero expected sequence number', () => {
      const filter = createFilter(['AccountCreated']);
      const expectedMaxSeq = 0;

      const result = buildCteInsertQuery(filter, expectedMaxSeq);

      expect(result.sql.includes('WHERE COALESCE(max_seq, 0) = 0')).toBe(true);
    });
  });
});