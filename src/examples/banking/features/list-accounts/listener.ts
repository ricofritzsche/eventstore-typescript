import { EventRecord, EventStore, HandleEvents } from '../../../../eventstore/types';
import { 
  handleAccountOpened, 
  handleMoneyDeposited, 
  handleMoneyWithdrawn, 
  handleMoneyTransferred 
} from './projector';

/**
 * Starts the account projection listener which processes incoming events from the event store and
 * updates the account projection in response to different event types such as opening an account,
 * depositing money, withdrawing money, or transferring money.
 *
 * @param {EventStore} eventStore - The event store used to subscribe and listen for events.
 * @param {string} connectionString - The database connection string used for handling account projection updates.
 * @return {Promise<() => Promise<void>>} A promise that resolves to a function which can be called to stop the listener by unsubscribing from the event store.
 */
export async function startAccountProjectionListener(
  eventStore: EventStore,
  connectionString: string
): Promise<() => Promise<void>> {
  const handleEvents: HandleEvents = async (events: EventRecord[]) => {
    for (const event of events) {
      try {
        switch (event.eventType) {
          case 'BankAccountOpened':
            await handleAccountOpened(event, connectionString);
            break;
          case 'MoneyDeposited':
            await handleMoneyDeposited(event, connectionString);
            break;
          case 'MoneyWithdrawn':
            await handleMoneyWithdrawn(event, connectionString);
            break;
          case 'MoneyTransferred':
            await handleMoneyTransferred(event, connectionString);
            break;
        }
      } catch (error) {
        console.error(`Error processing ${event.eventType} for account projection:`, error);
      }
    }
  };

  const subscription = await eventStore.subscribe(handleEvents);

  return async () => {
    await subscription.unsubscribe();
  };
}