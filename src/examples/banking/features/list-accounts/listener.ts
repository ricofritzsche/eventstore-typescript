import { EventStream, startProjectionListener, createProjectionConfig } from '../../../../eventstream';
import { 
  handleAccountOpened, 
  handleMoneyDeposited, 
  handleMoneyWithdrawn, 
  handleMoneyTransferred 
} from './projector';

export async function startAccountProjectionListener(
  eventStream: EventStream
): Promise<() => Promise<void>> {
  const config = createProjectionConfig(
    ['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred'],
    {
      'BankAccountOpened': handleAccountOpened,
      'MoneyDeposited': handleMoneyDeposited,
      'MoneyWithdrawn': handleMoneyWithdrawn,
      'MoneyTransferred': handleMoneyTransferred
    },
    {
      batchSize: 10,
      errorHandler: (error, event) => {
        console.error(`Error processing ${event.eventType} for account projection:`, error);
      }
    }
  );

  return await startProjectionListener(eventStream, config);
}