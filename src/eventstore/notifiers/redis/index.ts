import { createClient, RedisClientType } from 'redis';
import { EventRecord, EventStreamNotifier, EventSubscription, HandleEvents, Subscription } from '../../types';

export interface RedisPubSubNotifierOptions {
  connectionString?: string;
  database?: number;
  /**
   * Redis channel name for event notifications.
   * Default: 'eventstore:events'
   */
  channel?: string;
}

/**
 * RedisPubSubNotifier is a Redis Pub/Sub implementation of the EventStreamNotifier interface.
 * It enables cross-process/instance event notifications using Redis Pub/Sub.
 * 
 * This notifier uses separate connections for publishing and subscribing:
 * - Publisher connection: Used for PUBLISH operations
 * - Subscriber connection: Used for SUBSCRIBE operations (Pub/Sub takes over the connection)
 */
export class RedisPubSubNotifier implements EventStreamNotifier {
  private publisher: RedisClientType;
  private subscriber: RedisClientType;
  private readonly channel: string;
  private readonly database: number;
  private subscriptions: Map<string, Subscription> = new Map();
  private subscriptionCounter = 0;
  private isSubscriberConnected = false;
  private isClosed = false;

  constructor(options: RedisPubSubNotifierOptions = {}) {
    const connectionString = options.connectionString || process.env.REDIS_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        'notifiers-redis-err01: Connection string missing. REDIS_URL or DATABASE_URL environment variable not set.'
      );
    }

    this.database = options.database ?? 0;
    this.channel = options.channel ?? 'eventstore:events';

    // Create separate connections for publisher and subscriber
    // Pub/Sub requires a dedicated connection for subscriptions
    this.publisher = createClient({
      url: connectionString,
      database: this.database,
    });

    this.subscriber = createClient({
      url: connectionString,
      database: this.database,
    });
  }

  async subscribe(handle: HandleEvents): Promise<EventSubscription> {
    if (this.isClosed) {
      throw new Error('notifiers-redis-err02: Notifier is closed');
    }

    const id = `notifier-redis-sub-${++this.subscriptionCounter}`;
    const subscription: Subscription = { id, handle };

    // Ensure subscriber connection is established and listening BEFORE adding to subscriptions
    // This prevents orphaned subscriptions if connection setup fails
    if (!this.isSubscriberConnected) {
      await this.ensureSubscriberConnected();
    }

    // Only add to subscriptions map after connection is successfully established
    this.subscriptions.set(id, subscription);

    return {
      id,
      unsubscribe: async () => {
        this.subscriptions.delete(id);
        // If no more subscriptions, we could unsubscribe from Redis channel
        // But we keep the connection open for potential future subscriptions
      }
    };
  }

  async notify(events: EventRecord[]): Promise<void> {
    if (events.length === 0) return;
    if (this.isClosed) {
      throw new Error('notifiers-redis-err03: Notifier is closed');
    }

    try {
      // Ensure publisher is connected
      if (!this.publisher.isOpen) {
        await this.publisher.connect();
      }

      // Serialize events and publish to Redis channel
      const message = JSON.stringify(events);
      await this.publisher.publish(this.channel, message);
    } catch (error) {
      throw new Error(`notifiers-redis-err04: Failed to publish events: ${error}`);
    }
  }

  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;

    // Clear local subscriptions
    this.subscriptions.clear();

    // Close subscriber connection
    if (this.subscriber.isOpen) {
      try {
        await this.subscriber.unsubscribe(this.channel);
      } catch (error) {
        // Ignore unsubscribe errors if already unsubscribed
      }
      await this.subscriber.quit();
    }

    // Close publisher connection
    if (this.publisher.isOpen) {
      await this.publisher.quit();
    }
  }

  /**
   * Ensures the subscriber connection is connected and listening to the channel.
   * Sets up the message handler to route messages to local subscriptions.
   */
  private async ensureSubscriberConnected(): Promise<void> {
    if (this.isSubscriberConnected) {
      return;
    }

    try {
      // Connect subscriber if not already connected
      if (!this.subscriber.isOpen) {
        await this.subscriber.connect();
      }

      // Subscribe to the channel with message handler
      // In node-redis v5, the subscribe callback receives only the message parameter
      // The channel is already known since we're subscribing to a specific channel
      // Note: handleMessage is async, but we can't await it in the callback
      // We handle errors inside handleMessage itself
      await this.subscriber.subscribe(this.channel, (message: string) => {
        // Fire and forget - handleMessage handles its own errors
        // This is acceptable because:
        // 1. handleMessage has try-catch for error handling
        // 2. Redis Pub/Sub callbacks cannot be async/await
        // 3. Errors are logged and don't break the subscription
        void this.handleMessage(message).catch((error) => {
          console.error('notifiers-redis-err08: Unhandled error in handleMessage:', error);
        });
      });

      this.isSubscriberConnected = true;
    } catch (error) {
      throw new Error(`notifiers-redis-err05: Failed to setup subscriber: ${error}`);
    }
  }

  /**
   * Handles incoming messages from Redis Pub/Sub.
   * Deserializes events and notifies all local subscriptions.
   */
  private async handleMessage(message: string): Promise<void> {
    try {
      const events = JSON.parse(message) as Array<Omit<EventRecord, 'timestamp'> & { timestamp: string | Date }>;
      
      // Convert timestamp strings back to Date objects
      // JSON.parse converts Date objects to ISO strings, so we need to reconstruct them
      const eventsWithDates: EventRecord[] = events.map(event => ({
        ...event,
        timestamp: event.timestamp instanceof Date 
          ? event.timestamp 
          : new Date(event.timestamp as string),
      }));

      // Notify all local subscriptions
      const processPromises = Array.from(this.subscriptions.values()).map(async (subscription) => {
        try {
          await subscription.handle(eventsWithDates);
        } catch (error) {
          console.error(`notifiers-redis-err06: Error notifying subscription ${subscription.id}:`, error);
        }
      });

      await Promise.allSettled(processPromises);
    } catch (error) {
      console.error('notifiers-redis-err07: Error handling message:', error);
    }
  }
}

