import { MemoryEventStreamNotifier } from '../index';
import { EventRecord, HandleEvents } from '../../../types';

describe('MemoryEventStreamNotifier', () => {
  let notifier: MemoryEventStreamNotifier;

  beforeEach(() => {
    notifier = new MemoryEventStreamNotifier();
  });

  afterEach(async () => {
    await notifier.close();
  });

  describe('subscribe', () => {
    it('should create a subscription with unique ID', async () => {
      const handler: HandleEvents = jest.fn();
      
      const subscription = await notifier.subscribe(handler);
      
      expect(subscription.id).toBeDefined();
      expect(subscription.id).toMatch(/^notifier-sub-\d+$/);
      expect(typeof subscription.unsubscribe).toBe('function');
    });

    it('should create unique IDs for multiple subscriptions', async () => {
      const handler1: HandleEvents = jest.fn();
      const handler2: HandleEvents = jest.fn();
      
      const subscription1 = await notifier.subscribe(handler1);
      const subscription2 = await notifier.subscribe(handler2);
      
      expect(subscription1.id).not.toBe(subscription2.id);
    });

    it('should increment subscription counter', async () => {
      const handler: HandleEvents = jest.fn();
      
      const subscription1 = await notifier.subscribe(handler);
      const subscription2 = await notifier.subscribe(handler);
      
      expect(subscription1.id).toBe('notifier-sub-1');
      expect(subscription2.id).toBe('notifier-sub-2');
    });
  });

  describe('unsubscribe', () => {
    it('should remove subscription when unsubscribed', async () => {
      const handler: HandleEvents = jest.fn();
      const events: EventRecord[] = [
        { eventType: 'TestEvent', payload: { data: 'test' }, sequenceNumber: 1, timestamp: new Date() }
      ];
      
      const subscription = await notifier.subscribe(handler);
      
      // Verify subscription works
      await notifier.notify(events);
      expect(handler).toHaveBeenCalledWith(events);
      
      // Unsubscribe
      await subscription.unsubscribe();
      
      // Verify handler is no longer called
      jest.clearAllMocks();
      await notifier.notify(events);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow multiple unsubscribes without error', async () => {
      const handler: HandleEvents = jest.fn();
      const subscription = await notifier.subscribe(handler);
      
      await subscription.unsubscribe();
      await subscription.unsubscribe(); // Should not throw
      
      expect(true).toBe(true); // Test passes if no error thrown
    });
  });

  describe('notify', () => {
    it('should call all subscribed handlers with events', async () => {
      const handler1: HandleEvents = jest.fn();
      const handler2: HandleEvents = jest.fn();
      const events: EventRecord[] = [
        { eventType: 'TestEvent1', payload: { data: 'test1' }, sequenceNumber: 1, timestamp: new Date() },
        { eventType: 'TestEvent2', payload: { data: 'test2' }, sequenceNumber: 2, timestamp: new Date() }
      ];
      
      await notifier.subscribe(handler1);
      await notifier.subscribe(handler2);
      
      await notifier.notify(events);
      
      expect(handler1).toHaveBeenCalledWith(events);
      expect(handler2).toHaveBeenCalledWith(events);
    });

    it('should handle empty events array', async () => {
      const handler: HandleEvents = jest.fn();
      await notifier.subscribe(handler);
      
      await notifier.notify([]);
      
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle no subscriptions without error', async () => {
      const events: EventRecord[] = [
        { eventType: 'TestEvent', payload: { data: 'test' }, sequenceNumber: 1, timestamp: new Date() }
      ];
      
      await notifier.notify(events);
      
      // Should not throw error
      expect(true).toBe(true);
    });

    it('should handle async handlers', async () => {
      const handlerResults: string[] = [];
      const asyncHandler: HandleEvents = async (events) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        handlerResults.push(`handled-${events.length}`);
      };
      
      await notifier.subscribe(asyncHandler);
      
      const events: EventRecord[] = [
        { eventType: 'TestEvent', payload: { data: 'test' }, sequenceNumber: 1, timestamp: new Date() }
      ];
      
      await notifier.notify(events);
      
      expect(handlerResults).toEqual(['handled-1']);
    });

    it('should handle multiple async handlers concurrently', async () => {
      const handlerResults: string[] = [];
      const createAsyncHandler = (id: string): HandleEvents => async (events) => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
        handlerResults.push(`handler-${id}-${events.length}`);
      };
      
      await notifier.subscribe(createAsyncHandler('A'));
      await notifier.subscribe(createAsyncHandler('B'));
      await notifier.subscribe(createAsyncHandler('C'));
      
      const events: EventRecord[] = [
        { eventType: 'TestEvent', payload: { data: 'test' }, sequenceNumber: 1, timestamp: new Date() }
      ];
      
      await notifier.notify(events);
      
      expect(handlerResults).toHaveLength(3);
      expect(handlerResults).toContain('handler-A-1');
      expect(handlerResults).toContain('handler-B-1');
      expect(handlerResults).toContain('handler-C-1');
    });
  });

  describe('error handling', () => {
    it('should continue notifying other handlers when one throws error', async () => {
      const errorHandler: HandleEvents = jest.fn().mockRejectedValue(new Error('Handler error'));
      const successHandler: HandleEvents = jest.fn().mockResolvedValue(undefined);
      
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await notifier.subscribe(errorHandler);
      await notifier.subscribe(successHandler);
      
      const events: EventRecord[] = [
        { eventType: 'TestEvent', payload: { data: 'test' }, sequenceNumber: 1, timestamp: new Date() }
      ];
      
      await notifier.notify(events);
      
      expect(errorHandler).toHaveBeenCalledWith(events);
      expect(successHandler).toHaveBeenCalledWith(events);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error notifying subscription'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('should log errors with subscription ID', async () => {
      const errorHandler: HandleEvents = jest.fn().mockRejectedValue(new Error('Test error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const subscription = await notifier.subscribe(errorHandler);
      
      const events: EventRecord[] = [
        { eventType: 'TestEvent', payload: { data: 'test' }, sequenceNumber: 1, timestamp: new Date() }
      ];
      
      await notifier.notify(events);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        `notifiers-memory-err01: Error notifying subscription ${subscription.id}:`,
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle synchronous errors in handlers', async () => {
      const errorHandler: HandleEvents = jest.fn().mockImplementation(() => {
        throw new Error('Sync error');
      });
      const successHandler: HandleEvents = jest.fn();
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await notifier.subscribe(errorHandler);
      await notifier.subscribe(successHandler);
      
      const events: EventRecord[] = [
        { eventType: 'TestEvent', payload: { data: 'test' }, sequenceNumber: 1, timestamp: new Date() }
      ];
      
      await notifier.notify(events);
      
      expect(successHandler).toHaveBeenCalledWith(events);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('close', () => {
    it('should clear all subscriptions', async () => {
      const handler1: HandleEvents = jest.fn();
      const handler2: HandleEvents = jest.fn();
      
      await notifier.subscribe(handler1);
      await notifier.subscribe(handler2);
      
      await notifier.close();
      
      const events: EventRecord[] = [
        { eventType: 'TestEvent', payload: { data: 'test' }, sequenceNumber: 1, timestamp: new Date() }
      ];
      
      await notifier.notify(events);
      
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should allow close to be called multiple times', async () => {
      await notifier.close();
      await notifier.close(); // Should not throw
      
      expect(true).toBe(true);
    });

    it('should allow new subscriptions after close', async () => {
      const handler: HandleEvents = jest.fn();
      
      await notifier.close();
      await notifier.subscribe(handler);
      
      const events: EventRecord[] = [
        { eventType: 'TestEvent', payload: { data: 'test' }, sequenceNumber: 1, timestamp: new Date() }
      ];
      
      await notifier.notify(events);
      
      expect(handler).toHaveBeenCalledWith(events);
    });
  });

  describe('integration scenarios', () => {
    it('should handle complex subscription lifecycle', async () => {
      const handler1: HandleEvents = jest.fn();
      const handler2: HandleEvents = jest.fn();
      const handler3: HandleEvents = jest.fn();
      
      // Subscribe multiple handlers
      const sub1 = await notifier.subscribe(handler1);
      const sub2 = await notifier.subscribe(handler2);
      const sub3 = await notifier.subscribe(handler3);
      
      const events1: EventRecord[] = [
        { eventType: 'Event1', payload: { step: 1 }, sequenceNumber: 1, timestamp: new Date() }
      ];
      
      // First notification - all should receive
      await notifier.notify(events1);
      expect(handler1).toHaveBeenCalledWith(events1);
      expect(handler2).toHaveBeenCalledWith(events1);
      expect(handler3).toHaveBeenCalledWith(events1);
      
      // Unsubscribe middle handler
      await sub2.unsubscribe();
      jest.clearAllMocks();
      
      const events2: EventRecord[] = [
        { eventType: 'Event2', payload: { step: 2 }, sequenceNumber: 2, timestamp: new Date() }
      ];
      
      // Second notification - only 1 and 3 should receive
      await notifier.notify(events2);
      expect(handler1).toHaveBeenCalledWith(events2);
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).toHaveBeenCalledWith(events2);
      
      // Subscribe new handler
      const handler4: HandleEvents = jest.fn();
      await notifier.subscribe(handler4);
      jest.clearAllMocks();
      
      const events3: EventRecord[] = [
        { eventType: 'Event3', payload: { step: 3 }, sequenceNumber: 3, timestamp: new Date() }
      ];
      
      // Third notification - 1, 3, and 4 should receive
      await notifier.notify(events3);
      expect(handler1).toHaveBeenCalledWith(events3);
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).toHaveBeenCalledWith(events3);
      expect(handler4).toHaveBeenCalledWith(events3);
      
      // Close and verify no handlers are called
      await notifier.close();
      jest.clearAllMocks();
      
      await notifier.notify(events3);
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).not.toHaveBeenCalled();
      expect(handler4).not.toHaveBeenCalled();
    });
  });
});