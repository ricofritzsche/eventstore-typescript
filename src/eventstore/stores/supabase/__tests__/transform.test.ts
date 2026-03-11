import { deserializeEvent } from '../transform';

describe('Supabase transform', () => {
  it('deserializes a valid row', () => {
    const result = deserializeEvent({
      sequence_number: '42',
      occurred_at: '2024-01-02T03:04:05.000Z',
      event_type: 'AccountOpened',
      payload: { accountId: 'a1' },
    });

    expect(result.sequenceNumber).toBe(42);
    expect(result.timestamp).toBeInstanceOf(Date);
    expect(result.timestamp.toISOString()).toBe('2024-01-02T03:04:05.000Z');
    expect(result.eventType).toBe('AccountOpened');
    expect(result.payload).toEqual({ accountId: 'a1' });
  });

  it('rejects unsafe sequence numbers', () => {
    expect(() => deserializeEvent({
      sequence_number: '9007199254740992',
      occurred_at: '2024-01-02T03:04:05.000Z',
      event_type: 'AccountOpened',
      payload: { accountId: 'a1' },
    })).toThrow('eventstore-stores-supabase-err09');
  });
});

