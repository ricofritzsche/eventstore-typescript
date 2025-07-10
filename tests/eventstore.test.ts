import { EventStore, EventFilter } from '../src';
import { HasEventType, IEventStore } from '../src';
import dotenv from 'dotenv';

dotenv.config();

class TestEvent implements HasEventType {
  constructor(
    public readonly id: string,
    public readonly data: Record<string, unknown>,
    public readonly timestamp: Date = new Date()
  ) {}

  eventType(): string {
    return 'TestEvent';
  }

  eventVersion(): string {
    return '1.0';
  }
}

describe('EventStore', () => {
  let eventStore: IEventStore;

  beforeEach(() => {
    eventStore= new EventStore(
      { connectionString: process.env.DATABASE_TEST_URL || 'postgres://postgres:postgres@localhost:5432/eventstore_test' }
    );
  });

  afterEach(async () => {
    await eventStore.close();
  });

  it('should create an instance', () => {
    expect(eventStore).toBeInstanceOf(EventStore);
  });

  it('should create filter', () => {
    const filter = EventFilter.createFilter(['TestEvent']);
    expect(filter.eventTypes).toEqual(['TestEvent']);
  });

  it('should create filter with payload predicates', () => {
    const filter = EventFilter
      .createFilter(['TestEvent'])
      .withPayloadPredicate('id', '123');
    
    expect(filter.eventTypes).toEqual(['TestEvent']);
    expect(filter.payloadPredicates).toEqual({ id: '123' });
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
      expect(events[0]?.id).toBe('1');
    });

    it('should reject with existing state', () => {
      const state = { exists: true };
      expect(() => decideAssetRegistration(state, '1', { test: 'data' }))
        .toThrow('AssetAlreadyExists');
    });
  });
});