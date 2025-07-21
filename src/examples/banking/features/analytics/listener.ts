import { EventStore, EventRecord } from '../../../../eventstore/types';
import { 
  handleAccountOpened
} from './projector';

/**
 * Starts an analytics event listener, subscribing to events related to account analytics.
 * Processes relevant events and stores analytics data in the specified database table.
 *
 * @param {EventStore} eventStore - The event store instance used for subscribing to events.
 * @param {string} connectionString - The database connection string for storing analytics data.
 * @param {string} [tableName='account_analytics'] - The name of the database table for storing analytics data. Defaults to 'account_analytics'.
 * @return {Promise<() => Promise<void>>} A promise that resolves to a cleanup function, which stops the event listener when invoked.
 */
export async function startAnalyticsListener(
  eventStore: EventStore, 
  connectionString: string,
  tableName: string = 'account_analytics'
): Promise<() => Promise<void>> {
  console.log('🎯 Starting analytics event listener...');
  
  const subscription = await eventStore.subscribe(async (events: EventRecord[]) => {
    for (const event of events) {
      try {
        switch (event.eventType) {
          case 'BankAccountOpened':
            await handleAccountOpened(event, connectionString, tableName);
            break;
          default:
            // Ignore other event types
            break;
        }
      } catch (error) {
        console.error(`❌ Error processing analytics event ${event.eventType}:`, error);
      }
    }
  });
  
  console.log('✅ Analytics listener started successfully');
  
  // Return cleanup function
  return async () => {
    console.log('🛑 Stopping analytics listener...');
    await subscription.unsubscribe();
    console.log('✅ Analytics listener stopped');
  };
}