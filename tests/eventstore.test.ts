import { PostgresEventStore, createFilter, Event } from '../src/eventstore';
import dotenv from 'dotenv';

dotenv.config();

class TestEvent implements Event {
  public readonly eventType: string = 'TestEvent';
  public readonly payload: Record<string, unknown>;

  constructor(id: string, data: Record<string, unknown>) {
    this.payload = { id, ...data };
  }
}

describe('EventStore', () => {
  let eventStore: PostgresEventStore;

  beforeEach(async () => {
    eventStore= new PostgresEventStore(
      { connectionString: process.env.DATABASE_TEST_URL || 'postgres://postgres:postgres@localhost:5432/eventstore_test' }
    );

    await eventStore.initializeDatabase();
  });

  afterEach(async () => {
    await eventStore.close();
  });

  it('should create an instance', () => {
    expect(eventStore).toBeInstanceOf(PostgresEventStore);
  });

  it('should create filter', () => {
    const filter = createFilter(['TestEvent']);
    expect(filter.eventTypes).toEqual(['TestEvent']);
  });

  it('should create filter with payload predicates', () => {
    const filter = createFilter(['TestEvent'], [{ id: '123' }]);
    
    expect(filter.eventTypes).toEqual(['TestEvent']);
    expect(filter.payloadPredicates).toEqual([{ id: '123' }]);
  });

  describe('pure functions', () => {
    interface AssetState {
      exists: boolean;
    }

    function foldAssetState(events: TestEvent[]): AssetState {
      return { exists: events.length > 0 };
    }

    function decideAssetRegistration(
      state: AssetState,
      id: string,
      data: Record<string, unknown>
    ): TestEvent[] {
      if (state.exists) {
        throw new Error('AssetAlreadyExists');
      }
      return [new TestEvent(id, data)];
    }

    it('should fold empty state correctly', () => {
      const state = foldAssetState([]);
      expect(state.exists).toBe(false);
    });

    it('should fold existing state correctly', () => {
      const events = [new TestEvent('1', { test: 'data' })];
      const state = foldAssetState(events);
      expect(state.exists).toBe(true);
    });

    it('should decide with empty state', () => {
      const state = { exists: false };
      const events = decideAssetRegistration(state, '1', { test: 'data' });
      expect(events).toHaveLength(1);
      expect((events[0]?.payload as any).id).toBe('1');
    });

    it('should reject with existing state', () => {
      const state = { exists: true };
      expect(() => decideAssetRegistration(state, '1', { test: 'data' }))
        .toThrow('AssetAlreadyExists');
    });
  });
});