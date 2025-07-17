import { EventStore, EventFilter, Event, PostgresEventStore, createFilter } from '../src/eventstore';
import dotenv from 'dotenv';

dotenv.config();


class TestEvent implements Event {
  public readonly eventType: string;
  public readonly payload: Record<string, unknown>;

  constructor(eventType: string, id: string, data: Record<string, unknown>) {
    this.eventType = eventType;
    this.payload = { id, ...data };
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
    const filter = createFilter([eventType]);
    
    // There should be no events for that so far
    const initialResult = await eventStore.query(filter);
    expect(initialResult.events).toHaveLength(0);
    expect(initialResult.maxSequenceNumber).toBe(0);
    
    // Append one event with that temp type name
    const event1 = new TestEvent(eventType, 'test-1', { value: 'first' });
    await expect(eventStore.append([event1], filter, initialResult.maxSequenceNumber)).resolves.not.toThrow();

    // Retrieve this one event, the only one with this temp type name
    const afterInsert = await eventStore.query(filter);
    expect(afterInsert.events).toHaveLength(1);
    expect(afterInsert.maxSequenceNumber).toBeGreaterThan(0);
    expect((afterInsert.events[0]?.payload as any).id).toBe('test-1');
  });


  it('should fail when sequence number does not match (CTE condition)', async () => {
    // Create tempoary event type name
    const eventType = `TestEvent_${Date.now()}_2`;
    const filter = createFilter([eventType]);
    
    // Append an initial event
    const event1 = new TestEvent(eventType, 'test-2.1', { value: 'first' });
    await eventStore.append([event1], filter, 0);
    
    // Get the first and only event for the temp type name
    const currentResult = await eventStore.query(filter);
    const currentSequence = currentResult.maxSequenceNumber;
    expect(currentSequence).toBeGreaterThan(0);
    
    // Try to append with outdated sequence number (should fail)
    const event2 = new TestEvent(eventType, 'test-2.2', { value: 'second' });
    await expect(
      eventStore.append([event2], filter, 0) // Using outdated sequence 0 instead of current
    ).rejects.toThrow('Context changed: events were modified between query() and append()');
    
    // Verify the second event was NOT inserted
    const afterFailedInsert = await eventStore.query(filter);
    expect(afterFailedInsert.events).toHaveLength(1);
    expect(afterFailedInsert.maxSequenceNumber).toBe(currentSequence);
  });


  it('should handle concurrent modifications correctly', async () => {
    // Create temporary event type name
    const eventType = `TestEvent_${Date.now()}_3`;
    const filter = createFilter([eventType]);
    
    // Simulate concurrent scenario:
    // 1. Two processes query at the same time
    const [result1, result2] = await Promise.all([
      eventStore.query(filter),
      eventStore.query(filter)
    ]);
    
    expect(result1.maxSequenceNumber).toBe(0);
    expect(result2.maxSequenceNumber).toBe(0);
    
    // 2. First process successfully appends using its context sequence number
    const event1 = new TestEvent(eventType, 'concurrent-3.a.1', { process: 'A' });
    await eventStore.append([event1], filter, result1.maxSequenceNumber);
    
    // 3. Second process tries to append its context sequence number (which is now outdated due to first process)
    const event2 = new TestEvent(eventType, 'concurrent-3.b.1', { process: 'B' });
    await expect(
      eventStore.append([event2], filter, result2.maxSequenceNumber)
    ).rejects.toThrow('Context changed: events were modified between query() and append()');
    
    // Verify only the first event was inserted
    const finalResult = await eventStore.query(filter);
    expect(finalResult.events).toHaveLength(1);
    expect((finalResult.events[0]?.payload as any).id).toBe('concurrent-3.a.1');
    expect(finalResult.maxSequenceNumber).toBeGreaterThan(0);
  });


  it('should work with payload predicates in CTE condition', async () => {
    const eventType = `TestEvent_${Date.now()}_4`;
    const accountId = 'account-123';

    const filter = createFilter([eventType], [{ accountId: accountId }]);

    // Insert event for different account (should not affect our context)
    const otherFilter = createFilter([eventType], [{ accountId: 'other-account' }]);
    const otherEvent: Event = { 
      eventType: eventType, 
      payload: {
        id: 'test-4.1',
        accountId: 'other-account', // Top level property
        value: 'first'
      }
    };
    await eventStore.append([otherEvent], otherFilter, 0);
    
    // Query our specific context
    const result = await eventStore.query(filter);
    expect(result.events).toHaveLength(0);
    expect(result.maxSequenceNumber).toBe(0); // Should still be 0 for our context
    
    // Create event with accountId at the top level (not nested in data)
    const event: Event = { 
      eventType: eventType, 
      payload: {
        id: 'test-4.2',
        accountId, // Top level property for payload predicate matching
        value: 'second'
      }
    };
    await expect(eventStore.append([event], filter, 0)).resolves.not.toThrow();
    
    // Verify our event was inserted
    const afterInsert = await eventStore.query(filter);
    expect(afterInsert.events).toHaveLength(1);
    expect((afterInsert.events[0]?.payload as any).id).toBe('test-4.2');
    expect(afterInsert.maxSequenceNumber).toBeGreaterThan(0);
  });


  it('should work with multiple payload predicate options (OR conditions)', async () => {
    const eventType = `TestEvent_${Date.now()}_5`;
    const filter = createFilter([eventType], [
      { accountId: 'account-1' },
      { accountId: 'account-2' }
    ]);
    
    // Insert event for account-1
    const event1: Event = { 
      eventType: eventType, 
      payload: {
        id: 'test-5.1',
        accountId: 'account-1', // Top level property
        value: 'first'
      }
    };
    await eventStore.append([event1], filter, 0);
    
    // Query the OR context
    const result = await eventStore.query(filter);
    expect(result.events).toHaveLength(1);
    const currentSequence = result.maxSequenceNumber;
    expect(currentSequence).toBeGreaterThan(0);
    
    // Insert event for account-2 with correct sequence
    const event2: Event = { 
      eventType: eventType, 
      payload: {
        id: 'test-5.2',
        accountId: 'account-2', // Top level property
        value: 'second'
      }
    };
    //await expect(eventStore.append(filter, [event2], currentSequence)).resolves.not.toThrow();
    await eventStore.append([event2], filter, currentSequence);

    const result2 = await eventStore.query(filter);
    expect(result2.events).toHaveLength(2);
    const currentSequence2 = result2.maxSequenceNumber;
    expect(currentSequence2).toBeGreaterThan(currentSequence);
    
    // Try to insert with outdated sequence (should fail)
    const event3: Event = { 
      eventType: eventType, 
      payload: {
        id: 'test-5.3',
        accountId: 'account-1', // Top level property
        value: 'third'
      }
    };
    await expect(
      eventStore.append([event3], filter, currentSequence) // Outdated, should be currentSequence + 1
    ).rejects.toThrow('Context changed: events were modified between query() and append()');
  });

});