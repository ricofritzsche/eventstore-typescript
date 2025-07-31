import { buildContextQuerySql, buildAppendSql } from '../sql';
import { createFilter, createQuery } from '../../../filter';

describe('Sql builder', () => {
  describe('query', () => {
    it('No filters', () => {
      const result = buildContextQuerySql(createQuery(createFilter([],[])));
      expect(result.sql).toBe('SELECT * FROM events  ORDER BY sequence_number ASC');
      expect(result.params).toEqual([]);
    });

    it('event type', () => {
      const result = buildContextQuerySql(createQuery(createFilter(["t1"],[])));
      expect(result.sql).toBe('SELECT * FROM events WHERE ((event_type = ANY($1))) ORDER BY sequence_number ASC');
      expect(result.params).toEqual([["t1"]]);
    });

    it('event type with payload', () => {
      const result = buildContextQuerySql(createQuery(createFilter(["t1"],[{a:1}])));
      expect(result.sql).toBe('SELECT * FROM events WHERE ((event_type = ANY($1) AND (payload @> $2))) ORDER BY sequence_number ASC');
      expect(result.params).toEqual([["t1"], "{\"a\":1}"]);
    });
  });

  describe('append', () => {
    it('No filters', () => {
      const result = buildAppendSql(createQuery(createFilter([],[])), 1);
      expect(result.sql).toBe(`WITH context AS (SELECT MAX(sequence_number) AS max_seq FROM events)
INSERT INTO events (event_type, payload)
SELECT unnest($1::text[]), unnest($2::jsonb[]) FROM context WHERE COALESCE(max_seq, 0) = 1
RETURNING *`);
      expect(result.params).toEqual([]);
    });

    it('event type', () => {
      const result = buildAppendSql(createQuery(createFilter(["t1"],[])), 2);
      expect(result.sql).toBe(`WITH context AS (SELECT MAX(sequence_number) AS max_seq FROM events WHERE ((event_type = ANY($1))))
INSERT INTO events (event_type, payload)
SELECT unnest($2::text[]), unnest($3::jsonb[]) FROM context WHERE COALESCE(max_seq, 0) = 2
RETURNING *`);
      expect(result.params).toEqual([["t1"]]);
    });

    it('event type with payload', () => {
      const result = buildAppendSql(createQuery(createFilter(["t1"],[{a:1}])), 3);
      expect(result.sql).toBe(`WITH context AS (SELECT MAX(sequence_number) AS max_seq FROM events WHERE ((event_type = ANY($1) AND (payload @> $2))))
INSERT INTO events (event_type, payload)
SELECT unnest($3::text[]), unnest($4::jsonb[]) FROM context WHERE COALESCE(max_seq, 0) = 3
RETURNING *`);
      expect(result.params).toEqual([["t1"], "{\"a\":1}"]);
    });
  });
});