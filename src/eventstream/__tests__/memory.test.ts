import { MemoryEventStream } from '../memory';
import { createFilter } from '../../eventstore/filter';
import { Event } from '../../eventstore/types';
import { HandleEvents } from '../types';

describe('MemoryEventStream', () => {
  let eventStream: MemoryEventStream;

  beforeEach(() => {
    eventStream = new MemoryEventStream();
  });

  afterEach(async () => {
    await eventStream.close();
  });

  it('should create subscription with generated ID', async () => {
    const filter = createFilter(['TestEvent']);
    const handle: HandleEvents = async (events) => {
      console.log('Received events:', events);
    };

    const subscription = await eventStream.subscribe(filter, handle);

    expect(subscription.id).toBeDefined();
    expect(subscription.filter).toBe(filter);
    expect(subscription.handle).toBe(handle);
    expect(typeof subscription.unsubscribe).toBe('function');
  });

  it('should filter and dispatch events correctly', async () => {
    const filter = createFilter(['TestEvent']);
    const receivedEvents: Event[] = [];
    
    const handle: HandleEvents = async (events) => {
      receivedEvents.push(...events);
    };

    await eventStream.subscribe(filter, handle);

    const events: Event[] = [
      { eventType: 'TestEvent', payload: { data: 'test1' } },
      { eventType: 'OtherEvent', payload: { data: 'test2' } },
      { eventType: 'TestEvent', payload: { data: 'test3' } }
    ];

    await eventStream.dispatch(events);

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0]?.eventType).toBe('TestEvent');
    expect(receivedEvents[0]?.payload.data).toBe('test1');
    expect(receivedEvents[1]?.eventType).toBe('TestEvent');
    expect(receivedEvents[1]?.payload.data).toBe('test3');
  });

  it('should handle subscription unsubscribe', async () => {
    const filter = createFilter(['TestEvent']);
    const receivedEvents: Event[] = [];
    
    const handle: HandleEvents = async (events) => {
      receivedEvents.push(...events);
    };

    const subscription = await eventStream.subscribe(filter, handle);

    // Dispatch events before unsubscribe
    await eventStream.dispatch([
      { eventType: 'TestEvent', payload: { data: 'test1' } }
    ]);

    expect(receivedEvents).toHaveLength(1);

    // Unsubscribe
    await subscription.unsubscribe();

    // Dispatch events after unsubscribe
    await eventStream.dispatch([
      { eventType: 'TestEvent', payload: { data: 'test2' } }
    ]);

    // Should still have only 1 event (the one received before unsubscribe)
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]?.payload.data).toBe('test1');
  });

  it('should handle multiple subscriptions', async () => {
    const filter1 = createFilter(['TestEvent1']);
    const filter2 = createFilter(['TestEvent2']);
    
    const receivedEvents1: Event[] = [];
    const receivedEvents2: Event[] = [];
    
    const handle1: HandleEvents = async (events) => {
      receivedEvents1.push(...events);
    };
    
    const handle2: HandleEvents = async (events) => {
      receivedEvents2.push(...events);
    };

    await eventStream.subscribe(filter1, handle1);
    await eventStream.subscribe(filter2, handle2);

    const events: Event[] = [
      { eventType: 'TestEvent1', payload: { data: 'test1' } },
      { eventType: 'TestEvent2', payload: { data: 'test2' } },
      { eventType: 'TestEvent1', payload: { data: 'test3' } }
    ];

    await eventStream.dispatch(events);

    expect(receivedEvents1).toHaveLength(2);
    expect(receivedEvents1[0]?.eventType).toBe('TestEvent1');
    expect(receivedEvents1[1]?.eventType).toBe('TestEvent1');
    
    expect(receivedEvents2).toHaveLength(1);
    expect(receivedEvents2[0]?.eventType).toBe('TestEvent2');
  });

  it('should handle batch processing', async () => {
    const filter = createFilter(['TestEvent']);
    const batches: Event[][] = [];
    
    const handle: HandleEvents = async (events) => {
      batches.push(events);
    };

    await eventStream.subscribe(filter, handle, { batchSize: 2 });

    const events: Event[] = [
      { eventType: 'TestEvent', payload: { data: 'test1' } },
      { eventType: 'TestEvent', payload: { data: 'test2' } },
      { eventType: 'TestEvent', payload: { data: 'test3' } }
    ];

    await eventStream.dispatch(events);

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(2);
    expect(batches[1]).toHaveLength(1);
  });

  it('should handle payload predicates', async () => {
    const filter = createFilter(['TestEvent'], [{ userId: '123' }]);
    const receivedEvents: Event[] = [];
    
    const handle: HandleEvents = async (events) => {
      receivedEvents.push(...events);
    };

    await eventStream.subscribe(filter, handle);

    const events: Event[] = [
      { eventType: 'TestEvent', payload: { userId: '123', action: 'create' } },
      { eventType: 'TestEvent', payload: { userId: '456', action: 'update' } },
      { eventType: 'TestEvent', payload: { userId: '123', action: 'delete' } }
    ];

    await eventStream.dispatch(events);

    expect(receivedEvents).toHaveLength(2);
    expect(receivedEvents[0]?.payload.userId).toBe('123');
    expect(receivedEvents[1]?.payload.userId).toBe('123');
  });

  it('should handle errors gracefully', async () => {
    const filter = createFilter(['TestEvent']);
    const receivedEvents: Event[] = [];
    
    const handle: HandleEvents = async (events) => {
      for (const event of events) {
        if (event.payload.data === 'error') {
          throw new Error('Test error');
        }
        receivedEvents.push(event);
      }
    };

    await eventStream.subscribe(filter, handle);

    const events: Event[] = [
      { eventType: 'TestEvent', payload: { data: 'test1' } },
      { eventType: 'TestEvent', payload: { data: 'error' } },
      { eventType: 'TestEvent', payload: { data: 'test3' } }
    ];

    // Should not throw error
    await eventStream.dispatch(events);

    // Should have received the events processed before the error
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]?.payload.data).toBe('test1');
  });
});