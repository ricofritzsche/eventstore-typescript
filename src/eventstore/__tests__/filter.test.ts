import { createFilter } from '../filter';

describe('EventFilter Functions', () => {
  describe('createFilter', () => {
    it('should create filter with event types only', () => {
      const filter = createFilter(['AccountCreated', 'AccountUpdated']);

      expect(filter).toEqual({
        eventTypes: ['AccountCreated', 'AccountUpdated']
      });
    });

    it('should create filter with event types and payload predicates', () => {
      const filter = createFilter(['AccountCreated'], [{ accountId: '123', active: true }]);

      expect(filter).toEqual({
        eventTypes: ['AccountCreated'],
        payloadPredicates: [{ accountId: '123', active: true }]
      });
    });

    it('should create filter with multiple payload predicate options', () => {
      const payloadOptions = [
        { status: 'active' },
        { status: 'pending' }
      ];
      const filter = createFilter(['AccountCreated'], payloadOptions);

      expect(filter).toEqual({
        eventTypes: ['AccountCreated'],
        payloadPredicates: payloadOptions
      });
    });

    it('should create filter with single payload predicate', () => {
      const filter = createFilter(['AccountCreated'], [{ accountId: '123' }]);

      expect(filter).toEqual({
        eventTypes: ['AccountCreated'],
        payloadPredicates: [{ accountId: '123' }]
      });
    });

    it('should handle empty payload predicates array', () => {
      const filter = createFilter(['AccountCreated'], []);

      expect(filter).toEqual({
        eventTypes: ['AccountCreated'],
        payloadPredicates: []
      });
    });

    it('should not include undefined properties', () => {
      const filter = createFilter(['AccountCreated']);

      expect(filter).toEqual({
        eventTypes: ['AccountCreated']
      });
      expect(filter.payloadPredicates).toBeUndefined();
    });
  });
});