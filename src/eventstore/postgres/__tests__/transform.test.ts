import { QueryResult } from 'pg';
import { 
  deserializeEvent, 
  mapRecordsToEvents, 
  extractMaxSequenceNumber, 
  prepareInsertParams 
} from '../transform';
import { Event, GenericEvent } from '../../types';


describe('Transform Functions', () => {
  describe('deserializeEvent', () => {
    it('should deserialize event from database row', () => {
      const row = {
        event_type: 'UserCreated',
        event_version: '1.0',
        sequence_number: '123',
        occurred_at: '2023-01-01T00:00:00Z',
        payload: JSON.stringify({ data: 'test', userId: '456' })
      };

      const result = deserializeEvent(row);

      expect(result.toStructure()).toEqual({
        payload: { data: 'test', userId: '456' },
        metadata: {},
        eventType: 'UserCreated',
        eventVersion: '1.0',
        sequenceNumber: '123',
        timestamp: '2023-01-01T00:00:00Z'
      });
    });

    it('should handle already parsed JSON payload', () => {
      const row = {
        event_type: 'UserCreated',
        event_version: '1.0',
        sequence_number: '123',
        occurred_at: '2023-01-01T00:00:00Z',
        payload: { data: 'test', userId: '456' },
        metadata: {}
      };

      const result = deserializeEvent(row);

      expect(result.toStructure()).toEqual({
        payload: { data: 'test', userId: '456' },
        metadata: {},
        eventType: 'UserCreated',
        eventVersion: '1.0',
        sequenceNumber: '123',
        timestamp: '2023-01-01T00:00:00Z'
      });
    });
  });

  describe('mapRecordsToEvents', () => {
    it('should map multiple database rows to events', () => {
      const queryResult = {
        rows: [
          {
            event_type: 'UserCreated',
            sequence_number: '1',
            occurred_at: '2023-01-01T00:00:00Z',
            payload: { data: 'first' }
          },
          {
            event_type: 'UserUpdated',
            sequence_number: '2',
            occurred_at: '2023-01-01T01:00:00Z',
            payload: { data: 'second' }
          }
        ],
        command: 'SELECT',
        rowCount: 2,
        oid: 0,
        fields: []
      } as QueryResult<any>;

      const result = mapRecordsToEvents(queryResult);

      expect(result).toHaveLength(2);
      expect(result[0]!.payload().data).toBe('first');
      expect(result[1]!.payload().data).toBe('second');
    });

    it('should handle empty result set', () => {
      const queryResult = {
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: []
      } as QueryResult<any>;

      const result = mapRecordsToEvents(queryResult);

      expect(result).toEqual([]);
    });
  });

  describe('extractMaxSequenceNumber', () => {
    it('should extract max sequence number from last row', () => {
      const queryResult = {
        rows: [
          { sequence_number: '1' },
          { sequence_number: '5' },
          { sequence_number: '10' }
        ],
        command: 'SELECT',
        rowCount: 3,
        oid: 0,
        fields: []
      } as QueryResult<any>;

      const result = extractMaxSequenceNumber(queryResult);

      expect(result).toBe(10);
    });

    it('should return 0 for empty result set', () => {
      const queryResult = {
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: []
      } as QueryResult<any>;

      const result = extractMaxSequenceNumber(queryResult);

      expect(result).toBe(0);
    });
  });

  describe('prepareInsertParams', () => {
    it('should prepare parameters for insert query', () => {
      const events: Event[] = [
        new GenericEvent('UserCreated', '1.0', { data: 'test1' }),
        new GenericEvent('UserUpdated', '2.0', { data: 'test2' })
      ];
      const contextParams = ['context1', 'context2'];

      const result = prepareInsertParams(events, contextParams);

      expect(result).toEqual([
        'context1',
        'context2',
        ['UserCreated', 'UserUpdated'],
        ["1.0", "2.0"],
        [JSON.stringify(events[0]?.payload()), JSON.stringify(events[1]?.payload())],
        [JSON.stringify({}), JSON.stringify({})]
      ]);
    });

    it('should handle events without eventVersion', () => {
      const events: Event[] = [
        new GenericEvent('UserCreated', "1.0", { data: 'test1' })
      ];
      const contextParams: unknown[] = [];

      const result = prepareInsertParams(events, contextParams);

      expect(result).toEqual([
        ['UserCreated'],
        ["1.0"],
        [JSON.stringify(events[0]?.payload())],
        [JSON.stringify({})]
      ]);
    });

    it('should handle empty events array', () => {
      const events: Event[] = [];
      const contextParams = ['context1'];

      const result = prepareInsertParams(events, contextParams);

      expect(result).toEqual([
        'context1',
        [],
        [],
        [],
        []
      ]);
    });
  });
});