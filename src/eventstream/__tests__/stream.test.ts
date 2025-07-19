import { createFilter } from '../../eventstore/filter';
import { Event, EventFilter } from '../../eventstore/types';
import { HandleEvents } from '../types';
import { createStreamSubscription, matchesFilter, filterEvents, generateSubscriptionId } from '../stream';

describe('Event Stream Utilities', () => {
  describe('generateSubscriptionId', () => {
    it('should generate unique subscription IDs', () => {
      const id1 = generateSubscriptionId();
      const id2 = generateSubscriptionId();
      
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^sub_\d+_[a-z0-9]+$/);
    });
  });

  describe('matchesFilter', () => {
    it('should match event type correctly', () => {
      const event: Event = {
        eventType: 'TestEvent',
        payload: { data: 'test' }
      };
      
      const filter = createFilter(['TestEvent']);
      expect(matchesFilter(event, filter)).toBe(true);
      
      const filter2 = createFilter(['OtherEvent']);
      expect(matchesFilter(event, filter2)).toBe(false);
    });

    it('should match payload predicates correctly', () => {
      const event: Event = {
        eventType: 'TestEvent',
        payload: { userId: '123', action: 'create' }
      };
      
      const filter = createFilter(['TestEvent'], [{ userId: '123' }]);
      expect(matchesFilter(event, filter)).toBe(true);
      
      const filter2 = createFilter(['TestEvent'], [{ userId: '456' }]);
      expect(matchesFilter(event, filter2)).toBe(false);
    });

    it('should match OR payload predicates correctly', () => {
      const event: Event = {
        eventType: 'TestEvent',
        payload: { userId: '123', action: 'create' }
      };
      
      const filter = createFilter(['TestEvent'], [
        { userId: '456' },
        { userId: '123' }
      ]);
      expect(matchesFilter(event, filter)).toBe(true);
    });
  });

  describe('filterEvents', () => {
    it('should filter events correctly', () => {
      const events: Event[] = [
        { eventType: 'TestEvent', payload: { data: 'test1' } },
        { eventType: 'OtherEvent', payload: { data: 'test2' } },
        { eventType: 'TestEvent', payload: { data: 'test3' } }
      ];
      
      const filter = createFilter(['TestEvent']);
      const filtered = filterEvents(events, filter);
      
      expect(filtered).toHaveLength(2);
      expect(filtered[0]?.eventType).toBe('TestEvent');
      expect(filtered[1]?.eventType).toBe('TestEvent');
    });

    it('should filter events with payload predicates', () => {
      const events: Event[] = [
        { eventType: 'TestEvent', payload: { userId: '123', action: 'create' } },
        { eventType: 'TestEvent', payload: { userId: '456', action: 'update' } },
        { eventType: 'TestEvent', payload: { userId: '123', action: 'delete' } }
      ];
      
      const filter = createFilter(['TestEvent'], [{ userId: '123' }]);
      const filtered = filterEvents(events, filter);
      
      expect(filtered).toHaveLength(2);
      expect(filtered[0]?.payload.userId).toBe('123');
      expect(filtered[1]?.payload.userId).toBe('123');
    });
  });

  describe('createStreamSubscription', () => {
    it('should create subscription with correct properties', async () => {
      const filter = createFilter(['TestEvent']);
      const handle: HandleEvents = async (events) => {
        console.log('Received events:', events);
      };
      
      let unsubscribed = false;
      const unsubscribe = async () => {
        unsubscribed = true;
      };
      
      const subscription = createStreamSubscription(
        'test-id',
        filter,
        handle,
        { batchSize: 10 },
        unsubscribe
      );
      
      expect(subscription.id).toBe('test-id');
      expect(subscription.filter).toBe(filter);
      expect(subscription.handle).toBe(handle);
      expect(subscription.options.batchSize).toBe(10);
      
      await subscription.unsubscribe();
      expect(unsubscribed).toBe(true);
    });
  });
});