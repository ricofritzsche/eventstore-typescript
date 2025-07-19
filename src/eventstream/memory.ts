import { Event } from '../eventstore/types';
import { EventStream, EventSubscription, HandleEvents } from './types';

interface Subscription {
  id: string;
  handle: HandleEvents;
}

export class MemoryEventStream implements EventStream {
  private subscriptions: Map<string, Subscription> = new Map();
  private subscriptionCounter = 0;

  async subscribe(handle: HandleEvents): Promise<EventSubscription> {
    const id = `sub-${++this.subscriptionCounter}`;
    const subscription: Subscription = { id, handle };
    
    this.subscriptions.set(id, subscription);
    
    return {
      id,
      unsubscribe: async () => {
        this.subscriptions.delete(id);
      }
    };
  }

  async dispatch(events: Event[]): Promise<void> {
    if (events.length === 0) return;

    const processPromises = Array.from(this.subscriptions.values()).map(async (subscription) => {
      try {
        await subscription.handle(events);
      } catch (error) {
        console.error(`Error handling events for subscription ${subscription.id}:`, error);
      }
    });

    await Promise.allSettled(processPromises);
  }

  async close(): Promise<void> {
    this.subscriptions.clear();
  }
}