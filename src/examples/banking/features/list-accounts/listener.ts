import { EventStream, HandleEvents } from '../../../../eventstream';
import { Event } from '../../../../eventstore/types';
import { 
  handleAccountOpened, 
  handleMoneyDeposited, 
  handleMoneyWithdrawn, 
  handleMoneyTransferred 
} from './projector';

export async function startAccountProjectionListener(
  eventStream: EventStream,
  connectionString: string
): Promise<() => Promise<void>> {
  const handleEvents: HandleEvents = async (events: Event[]) => {
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

  const subscription = await eventStream.subscribe(handleEvents);

  return async () => {
    await subscription.unsubscribe();
  };
}