import { compileContextQueryConditions } from '../query';
import { createFilter, createQuery } from '../../../filter';

describe('Conditions compiler', () => {
  describe('single filter', () => {
    it('No filters', () => {
      const result = compileContextQueryConditions(createQuery(createFilter([],[])));
      expect(result.sql).toBe('');
      expect(result.params).toEqual([]);
    });

    it('Single typename', () => {
      const result = compileContextQueryConditions(createQuery(createFilter(["t1"],[])));
      expect(result.sql).toBe('((event_type = ANY($1)))');
      expect(result.params).toEqual([['t1']]);
    });

    it('Multiple typenames', () => {
      const result = compileContextQueryConditions(createQuery(createFilter(["t1", "t2"],[])));
      expect(result.sql).toBe('((event_type = ANY($1)))');
      expect(result.params).toEqual([['t1', 't2']]);
    });

    it('Single typename with single payload', () => {
      const result = compileContextQueryConditions(createQuery(createFilter(["t1"],[{ a: 1 }])));
      expect(result.sql).toBe('((event_type = ANY($1) AND (payload @> $2)))');
      expect(result.params).toEqual([['t1'], '{"a":1}']);
    });

    it('Single typename with multiple payloads', () => {
      const result = compileContextQueryConditions(createQuery(createFilter(["t1"],[{ a: 1 }, { b: 2 }])));
      expect(result.sql).toBe('((event_type = ANY($1) AND (payload @> $2 OR payload @> $3)))');
      expect(result.params).toEqual([['t1'], '{"a":1}', '{"b":2}']);
    });

    it('Payloads only', () => {
      const result = compileContextQueryConditions(createQuery(createFilter([],[{ a: 1 }, { b: 2 }])));
      expect(result.sql).toBe('(((payload @> $1 OR payload @> $2)))');
      expect(result.params).toEqual(['{"a":1}', '{"b":2}']);
    });
  });

  describe('multiple filters (query)', () => {
    it('only typenames', () => {
      const result = compileContextQueryConditions(createQuery(createFilter(["t1"],[]), createFilter(["t2"],[])));
      expect(result.sql).toBe('((event_type = ANY($1))) OR ((event_type = ANY($2)))');
      expect(result.params).toEqual([['t1'], ["t2"]]);
    });

    it('only typenames with payload', () => {
      const result = compileContextQueryConditions(createQuery(createFilter(["t1"],[{ a: 1 }]), createFilter(["t2"],[{ b: 2 }, { c: 3 }])));
      expect(result.sql).toBe('((event_type = ANY($1) AND (payload @> $2))) OR ((event_type = ANY($3) AND (payload @> $4 OR payload @> $5)))');
      expect(result.params).toEqual([['t1'], '{"a":1}', ['t2'], '{"b":2}', '{"c":3}']);
    });
  });
});