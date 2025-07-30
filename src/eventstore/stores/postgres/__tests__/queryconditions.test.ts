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


});