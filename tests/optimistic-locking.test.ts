import { IHasEventType, IEventStore, EventFilter, PostgresEventStore } from '../src/eventstore';
import dotenv from 'dotenv';

dotenv.config();

class TestEvent implements IHasEventType {
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
  let eventStore: PostgresEventStore;

  beforeEach(async () => {
    const connectionString = process.env.DATABASE_TEST_URL || 'postgres://postgres:postgres@localhost:5432/eventstore_test';
    eventStore = new PostgresEventStore(
      { connectionString: connectionString }
    );
    await eventStore.initializeDatabase();
  });

  afterEach(async () => {
    await eventStore.close();
  });

  it('should succeed when sequence number matches expected', async () => {
    // Create a temporary event type name
    const eventType = `TestEvent_${Date.now()}_1`;
    const filter = EventFilter.fromEventTypesOnly([eventType]);
    
    // There should be no events for that so far
    const initialResult = await eventStore.query<TestEvent>(filter);
    expect(initialResult.events).toHaveLength(0);
    expect(initialResult.maxSequenceNumber).toBe(0);
    
    // Append one event with that temp type name
    const event1 = new TestEvent('test-1', { value: 'first' }, eventType);
    await expect(eventStore.append(filter, [event1], initialResult.maxSequenceNumber)).resolves.not.toThrow();
    console.log("appended 1 event")

    // Retrieve this one event, the only one with this temp type name
    const afterInsert = await eventStore.query<TestEvent>(filter);
    expect(afterInsert.events).toHaveLength(1);
    expect(afterInsert.maxSequenceNumber).toBeGreaterThan(0);
    expect(afterInsert.events[0]?.id).toBe('test-1');
  });


  it('should fail when sequence number does not match (CTE condition)', async () => {
    // Create tempoary event type name
    const eventType = `TestEvent_${Date.now()}_2`;
    const filter = EventFilter.fromEventTypesOnly([eventType]);
    
    // Append an initial event
    const event1 = new TestEvent('test-2.1', { value: 'first' }, eventType);
    await eventStore.append(filter, [event1], 0);
    
    // Get the first and only event for the temp type name
    const currentResult = await eventStore.query<TestEvent>(filter);
    const currentSequence = currentResult.maxSequenceNumber;
    expect(currentSequence).toBeGreaterThan(0);
    
    // Try to append with outdated sequence number (should fail)
    const event2 = new TestEvent('test-2.2', { value: 'second' }, eventType);
    await expect(
      eventStore.append(filter, [event2], 0) // Using outdated sequence 0 instead of current
    ).rejects.toThrow('Context changed: events were modified between query() and append()');
    
    // Verify the second event was NOT inserted
    const afterFailedInsert = await eventStore.query<TestEvent>(filter);
    expect(afterFailedInsert.events).toHaveLength(1);
    expect(afterFailedInsert.maxSequenceNumber).toBe(currentSequence);
  });


  it('should handle concurrent modifications correctly', async () => {
    // Create temporary event type name
    const eventType = `TestEvent_${Date.now()}_3`;
    const filter = EventFilter.fromEventTypesOnly([eventType]);
    
    // Simulate concurrent scenario:
    // 1. Two processes query at the same time
    const [result1, result2] = await Promise.all([
      eventStore.query<TestEvent>(filter),
      eventStore.query<TestEvent>(filter)
    ]);
    
    expect(result1.maxSequenceNumber).toBe(0);
    expect(result2.maxSequenceNumber).toBe(0);
    
    // 2. First process successfully appends using its context sequence number
    const event1 = new TestEvent('concurrent-3.a.1', { process: 'A' }, eventType);
    await eventStore.append(filter, [event1], result1.maxSequenceNumber);
    
    // 3. Second process tries to append its context sequence number (which is now outdated due to first process)
    const event2 = new TestEvent('concurrent-3.b.1', { process: 'B' }, eventType);
    await expect(
      eventStore.append(filter, [event2], result2.maxSequenceNumber)
    ).rejects.toThrow('Context changed: events were modified between query() and append()');
    
    // Verify only the first event was inserted
    const finalResult = await eventStore.query<TestEvent>(filter);
    expect(finalResult.events).toHaveLength(1);
    expect(finalResult.events[0]?.id).toBe('concurrent-3.a.1');
    expect(finalResult.maxSequenceNumber).toBeGreaterThan(0);
  });


  it('should work with payload predicates in CTE condition', async () => {
    const eventType = `TestEvent_${Date.now()}_4`;
    const accountId = 'account-123';

    const filter = EventFilter.fromEventTypesOnly([eventType])
                              //.withPayloadPredicate("accountId", accountId);
                              .withPayloadPredicates([{ accountId: accountId }]);

    // Insert event for different account (should not affect our context)
    const otherFilter = EventFilter.fromEventTypesOnly([eventType])
                                   .withPayloadPredicates([{ accountId: 'other-account' }]);
    const otherEvent = {
      id: 'test-4.1',
      accountId: 'other-account', // Top level property
      value: 'first',
      eventType: () => eventType,
      eventVersion: () => '1.0'
    };
    await eventStore.append(otherFilter, [otherEvent], 0);
    
    // Query our specific context
    const result = await eventStore.query<TestEvent>(filter);
    expect(result.events).toHaveLength(0);
    expect(result.maxSequenceNumber).toBe(0); // Should still be 0 for our context
    
    // Create event with accountId at the top level (not nested in data)
    const event = {
      id: 'test-4.2',
      accountId, // Top level property for payload predicate matching
      value: 'second',
      eventType: () => eventType,
      eventVersion: () => '1.0'
    };
    await expect(eventStore.append(filter, [event], 0)).resolves.not.toThrow();
    
    // Verify our event was inserted
    const afterInsert = await eventStore.query<TestEvent>(filter);
    expect(afterInsert.events).toHaveLength(1);
    expect(afterInsert.events[0]?.id).toBe('test-4.2');
    expect(afterInsert.maxSequenceNumber).toBeGreaterThan(0);
  });


  it('should work with multiple payload predicate options (OR conditions)', async () => {
    const eventType = `TestEvent_${Date.now()}_5`;
    const filter = EventFilter.fromPayloadPredicateOptions([eventType], [
      { accountId: 'account-1' },
      { accountId: 'account-2' }
    ]);
    
    // Insert event for account-1
    const event1 = {
      id: 'test-5.1',
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
      id: 'test-5.2',
      accountId: 'account-2', // Top level property
      value: 'second',
      eventType: () => eventType,
      eventVersion: () => '1.0'
    };
    //await expect(eventStore.append(filter, [event2], currentSequence)).resolves.not.toThrow();
    await eventStore.append(filter, [event2], currentSequence);

    const result2 = await eventStore.query<TestEvent>(filter);
    expect(result2.events).toHaveLength(2);
    const currentSequence2 = result2.maxSequenceNumber;
    expect(currentSequence2).toBeGreaterThan(currentSequence);
    
    // Try to insert with outdated sequence (should fail)
    const event3 = {
      id: 'test-5.3',
      accountId: 'account-1', // Top level property
      value: 'third',
      eventType: () => eventType,
      eventVersion: () => '1.0'
    };
    await expect(
      eventStore.append(filter, [event3], currentSequence) // Outdated, should be currentSequence + 1
    ).rejects.toThrow('Context changed: events were modified between query() and append()');
  });

});