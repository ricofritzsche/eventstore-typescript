import { EventStore, EventFilter } from '../src/eventstore';
import { HasEventType } from '../src/eventstore/types';
import dotenv from 'dotenv';

dotenv.config();

class TestEvent implements HasEventType {
  constructor(
    public readonly id: string,
    public readonly data: Record<string, unknown>,
    public readonly eventTypeName: string = 'TestEvent',
    public readonly timestamp: Date = new Date()
  ) {}

  eventType(): string {
    return this.eventTypeName;
  }

  eventVersion(): string {
    return '1.0';
  }
}

describe('Optimistic Locking CTE Condition', () => {
  let eventStore: EventStore;

  beforeEach(async () => {
    eventStore = new EventStore(
      { connectionString: process.env.DATABASE_TEST_URL || 'postgres://postgres:postgres@localhost:5432/eventstore_test' }
    );
    await eventStore.migrate();
  });

  afterEach(async () => {
    await eventStore.close();
  });

  it('should succeed when sequence number matches expected', async () => {
    const eventType = `TestEvent_${Date.now()}_1`;
    const filter = EventFilter.createFilter([eventType]);
    
    // First, query to get current state and sequence
    const initialResult = await eventStore.query<TestEvent>(filter);
    expect(initialResult.events).toHaveLength(0);
    expect(initialResult.maxSequenceNumber).toBe(0);
    
    // Append with correct expected sequence should succeed
    const event1 = new TestEvent('test-1', { value: 'first' }, eventType);
    await expect(eventStore.append(filter, [event1], 0)).resolves.not.toThrow();
    
    // Verify the event was inserted
    const afterInsert = await eventStore.query<TestEvent>(filter);
    expect(afterInsert.events).toHaveLength(1);
    expect(afterInsert.maxSequenceNumber).toBeGreaterThan(0);
    expect(afterInsert.events[0]?.id).toBe('test-1');
  });

  it('should fail when sequence number does not match (CTE condition)', async () => {
    const eventType = `TestEvent_${Date.now()}_2`;
    const filter = EventFilter.createFilter([eventType]);
    
    // Insert an initial event
    const event1 = new TestEvent('test-1', { value: 'first' }, eventType);
    await eventStore.append(filter, [event1], 0);
    
    // Get current state
    const currentResult = await eventStore.query<TestEvent>(filter);
    const currentSequence = currentResult.maxSequenceNumber;
    expect(currentSequence).toBeGreaterThan(0);
    
    // Try to append with outdated sequence number (should fail)
    const event2 = new TestEvent('test-2', { value: 'second' }, eventType);
    await expect(
      eventStore.append(filter, [event2], 0) // Using outdated sequence 0 instead of current
    ).rejects.toThrow('Context changed: events were modified between query and append');
    
    // Verify the second event was NOT inserted
    const afterFailedInsert = await eventStore.query<TestEvent>(filter);
    expect(afterFailedInsert.events).toHaveLength(1);
    expect(afterFailedInsert.maxSequenceNumber).toBe(currentSequence);
  });

  it('should handle concurrent modifications correctly', async () => {
    const eventType = `TestEvent_${Date.now()}_3`;
    const filter = EventFilter.createFilter([eventType]);
    
    // Simulate concurrent scenario:
    // 1. Two processes query at the same time
    const [result1, result2] = await Promise.all([
      eventStore.query<TestEvent>(filter),
      eventStore.query<TestEvent>(filter)
    ]);
    
    expect(result1.maxSequenceNumber).toBe(0);
    expect(result2.maxSequenceNumber).toBe(0);
    
    // 2. First process successfully appends
    const event1 = new TestEvent('concurrent-1', { process: 'A' }, eventType);
    await eventStore.append(filter, [event1], result1.maxSequenceNumber);
    
    // 3. Second process tries to append with same sequence (should fail)
    const event2 = new TestEvent('concurrent-2', { process: 'B' }, eventType);
    await expect(
      eventStore.append(filter, [event2], result2.maxSequenceNumber)
    ).rejects.toThrow('Context changed: events were modified between query and append');
    
    // Verify only the first event was inserted
    const finalResult = await eventStore.query<TestEvent>(filter);
    expect(finalResult.events).toHaveLength(1);
    expect(finalResult.events[0]?.id).toBe('concurrent-1');
    expect(finalResult.maxSequenceNumber).toBeGreaterThan(0);
  });

  it('should work with payload predicates in CTE condition', async () => {
    const eventType = `TestEvent_${Date.now()}_4`;
    const accountId = 'account-123';
    const filter = EventFilter.createFilter([eventType])
      .withPayloadPredicates({ accountId });
    
    // Insert event for different account (should not affect our context)
    const otherFilter = EventFilter.createFilter([eventType])
      .withPayloadPredicates({ accountId: 'other-account' });
    const otherEvent = {
      id: 'other',
      accountId: 'other-account', // Top level property
      value: 'other',
      eventType: () => eventType,
      eventVersion: () => '1.0'
    };
    await eventStore.append(otherFilter, [otherEvent], 0);
    
    // Query our specific context
    const result = await eventStore.query<TestEvent>(filter);
    expect(result.events).toHaveLength(0);
    expect(result.maxSequenceNumber).toBe(0); // Should be 0 for our context
    
    // Create event with accountId at the top level (not nested in data)
    const event = {
      id: 'test-1',
      accountId, // Top level property for payload predicate matching
      value: 'first',
      eventType: () => eventType,
      eventVersion: () => '1.0'
    };
    await expect(eventStore.append(filter, [event], 0)).resolves.not.toThrow();
    
    // Verify our event was inserted
    const afterInsert = await eventStore.query<TestEvent>(filter);
    expect(afterInsert.events).toHaveLength(1);
    expect(afterInsert.events[0]?.id).toBe('test-1');
    expect(afterInsert.maxSequenceNumber).toBeGreaterThan(0);
  });

  it('should work with multiple payload predicate options (OR conditions)', async () => {
    const eventType = `TestEvent_${Date.now()}_5`;
    const filter = EventFilter.createFilter([eventType], [
      { accountId: 'account-1' },
      { accountId: 'account-2' }
    ]);
    
    // Insert event for account-1
    const event1 = {
      id: 'test-1',
      accountId: 'account-1', // Top level property
      value: 'first',
      eventType: () => eventType,
      eventVersion: () => '1.0'
    };
    await eventStore.append(filter, [event1], 0);
    
    // Query the OR context
    const result = await eventStore.query<TestEvent>(filter);
    expect(result.events).toHaveLength(1);
    const currentSequence = result.maxSequenceNumber;
    expect(currentSequence).toBeGreaterThan(0);
    
    // Insert event for account-2 with correct sequence
    const event2 = {
      id: 'test-2',
      accountId: 'account-2', // Top level property
      value: 'second',
      eventType: () => eventType,
      eventVersion: () => '1.0'
    };
    await expect(eventStore.append(filter, [event2], currentSequence)).resolves.not.toThrow();
    
    // Try to insert with outdated sequence (should fail)
    const event3 = {
      id: 'test-3',
      accountId: 'account-1', // Top level property
      value: 'third',
      eventType: () => eventType,
      eventVersion: () => '1.0'
    };
    await expect(
      eventStore.append(filter, [event3], currentSequence) // Outdated, should be currentSequence + 1
    ).rejects.toThrow('Context changed: events were modified between query and append');
  });
});