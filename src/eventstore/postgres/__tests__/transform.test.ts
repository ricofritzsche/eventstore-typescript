import { QueryResult } from 'pg';
import { 
  deserializeEvent, 
  mapRecordsToEvents, 
  extractMaxSequenceNumber, 
  prepareInsertParams 
} from '../transform';
import { HasEventType } from '../../types';

interface TestEvent extends HasEventType {
  eventType(): string;
  eventVersion?(): string;
  data: string;
}

describe('Transform Functions', () => {
  describe('deserializeEvent', () => {
    it('should deserialize event from database row', () => {
      const row = {
        event_type: 'UserCreated',
        sequence_number: '123',
        occurred_at: '2023-01-01T00:00:00Z',
        payload: JSON.stringify({ data: 'test', userId: '456' })
      };

      const result = deserializeEvent<TestEvent>(row);

      expect(result).toEqual({
        data: 'test',
        userId: '456',
        event_type: 'UserCreated',
        sequenceNumber: '123',
        occurredAt: '2023-01-01T00:00:00Z'
      });
    });

    it('should handle already parsed JSON payload', () => {
      const row = {
        event_type: 'UserCreated',
        sequence_number: '123',
        occurred_at: '2023-01-01T00:00:00Z',
        payload: { data: 'test', userId: '456' }
      };

      const result = deserializeEvent<TestEvent>(row);

      expect(result).toEqual({
        data: 'test',
        userId: '456',
        event_type: 'UserCreated',
        sequenceNumber: '123',
        occurredAt: '2023-01-01T00:00:00Z'
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

      const result = mapRecordsToEvents<TestEvent>(queryResult);

      expect(result).toHaveLength(2);
      expect(result[0]!.data).toBe('first');
      expect(result[1]!.data).toBe('second');
    });

    it('should handle empty result set', () => {
      const queryResult = {
        rows: [],
        command: 'SELECT',
        rowCount: 0,
        oid: 0,
        fields: []
      } as QueryResult<any>;

      const result = mapRecordsToEvents<TestEvent>(queryResult);

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
      const events: TestEvent[] = [
        {
          eventType: () => 'UserCreated',
          eventVersion: () => '2.0',
          data: 'test1'
        },
        {
          eventType: () => 'UserUpdated',
          data: 'test2'
        }
      ];
      const contextParams = ['context1', 'context2'];

      const result = prepareInsertParams(events, contextParams);

      expect(result).toEqual([
        'context1',
        'context2',
        ['UserCreated', 'UserUpdated'],
        [JSON.stringify(events[0]), JSON.stringify(events[1])],
        [JSON.stringify({ version: '2.0' }), JSON.stringify({ version: '1.0' })]
      ]);
    });

    it('should handle events without eventVersion', () => {
      const events: TestEvent[] = [
        {
          eventType: () => 'UserCreated',
          data: 'test'
        }
      ];
      const contextParams: unknown[] = [];

      const result = prepareInsertParams(events, contextParams);

      expect(result).toEqual([
        ['UserCreated'],
        [JSON.stringify(events[0])],
        [JSON.stringify({ version: '1.0' })]
      ]);
    });

    it('should handle empty events array', () => {
      const events: TestEvent[] = [];
      const contextParams = ['context1'];

      const result = prepareInsertParams(events, contextParams);

      expect(result).toEqual([
        'context1',
        [],
        [],
        []
      ]);
    });
  });
});