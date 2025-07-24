import { EventRecord, EventStreamNotifier, EventSubscription, HandleEvents, Subscription } from '../../types.ts';

/**
 * MemoryEventStreamNotifier is an in-memory implementation of the EventStreamNotifier interface.
 * It allows subscribing to an event stream, notifying subscribers of events, and managing subscriptions.
 * This is the default mechanism to notify about events in an app.
 */
export class MemoryEventStreamNotifier implements EventStreamNotifier {
  private subscriptions: Map<string, Subscription> = new Map();
  private subscriptionCounter = 0;

  async subscribe(handle: HandleEvents): Promise<EventSubscription> {
    const id = `notifier-sub-${++this.subscriptionCounter}`;
    const subscription: Subscription = { id, handle };
    
    this.subscriptions.set(id, subscription);
    
    return {
      id,
      unsubscribe: async () => {
        this.subscriptions.delete(id);
      }
    };
  }

  async notify(events: EventRecord[]): Promise<void> {
    if (events.length === 0) return;

    const processPromises = Array.from(this.subscriptions.values()).map(async (subscription) => {
      try {
        await subscription.handle(events);
      } catch (error) {
        console.error(`notifiers-memory-err01: Error notifying subscription ${subscription.id}:`, error);
      }
    });

    await Promise.allSettled(processPromises);
  }

  async close(): Promise<void> {
    this.subscriptions.clear();
  }
}