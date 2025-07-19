import { Event, EventFilter } from '../eventstore/types';
import { 
  EventStream, 
  StreamSubscription, 
  EventStreamOptions, 
  HandleEvents 
} from './types';
import { 
  createStreamSubscription, 
  filterEvents, 
  generateSubscriptionId 
} from './stream';

export class MemoryEventStream implements EventStream {
  private subscriptions: Map<string, StreamSubscription> = new Map();

  async subscribe(
    filter: EventFilter, 
    handle: HandleEvents, 
    options: EventStreamOptions = {}
  ): Promise<StreamSubscription> {
    const id = generateSubscriptionId();
    const subscription = createStreamSubscription(
      id,
      filter,
      handle,
      options,
      () => this.unsubscribe(id)
    );

    this.subscriptions.set(id, subscription);
    return subscription;
  }

  async dispatch(events: Event[]): Promise<void> {
    if (events.length === 0) return;

    const processPromises = Array.from(this.subscriptions.values()).map(async (subscription) => {
      const matchingEvents = filterEvents(events, subscription.filter);
      
      if (matchingEvents.length > 0) {
        try {
          // Process events in batches if configured
          const batchSize = subscription.options.batchSize || matchingEvents.length;
          
          for (let i = 0; i < matchingEvents.length; i += batchSize) {
            const batch = matchingEvents.slice(i, i + batchSize);
            await subscription.handle(batch);
          }
        } catch (error) {
          console.error(`Error handling events for subscription ${subscription.id}:`, error);
        }
      }
    });

    await Promise.allSettled(processPromises);
  }

  async close(): Promise<void> {
    this.subscriptions.clear();
  }

  private async unsubscribe(subscriptionId: string): Promise<void> {
    this.subscriptions.delete(subscriptionId);
  }
}