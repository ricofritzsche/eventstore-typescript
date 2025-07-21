import { EventFilter, createFilter } from '../../../../eventstore';
import { EventStore } from '../../../../eventstore';
import { GetAccountQuery, GetAccountResult, BankAccount } from './types';

export async function execute(
  eventStore: EventStore,
  query: GetAccountQuery
): Promise<GetAccountResult> {
  const accountViewStateResult = await getAccountViewState(eventStore, query.accountId);
  
  return accountViewStateResult.state.account;
}

async function getAccountViewState(eventStore: EventStore, accountId: string): Promise<{
  state: {
    account: BankAccount | null;
  };
  maxSequenceNumber: number;
}> {
  // Single optimized query using payloadPredicateOptions for multiple account relationships
  const filter = createFilter(
    ['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred'],
    [
      { accountId: accountId },
      { fromAccountId: accountId },
      { toAccountId: accountId }
    ]
  );
  
  const result = await eventStore.query(filter);
  const allEvents = result.events;
  
  const openingEvent = allEvents.find(e => 
    e.eventType === 'BankAccountOpened'
  );
  
  if (!openingEvent) {
    return { 
      state: { account: null },
      maxSequenceNumber: result.maxSequenceNumber
    };
  }

  let currentBalance = openingEvent.payload.initialDeposit as number;

  for (const event of allEvents) {
    const eventType = event.eventType;
    
    if (eventType === 'MoneyDeposited' && event.payload.currency === openingEvent.payload.currency) {
      currentBalance += event.payload.amount as number;
    } else if (eventType === 'MoneyWithdrawn' && event.payload.currency === openingEvent.payload.currency) {
      currentBalance -= event.payload.amount as number;
    } else if (eventType === 'MoneyTransferred' && event.payload.currency === openingEvent.payload.currency) {
      if (event.payload.fromAccountId === accountId) {
        currentBalance -= event.payload.amount as number;
      } else if (event.payload.toAccountId === accountId) {
        currentBalance += event.payload.amount as number;
      }
    }
  }

  const maxSequenceNumber = result.maxSequenceNumber;

  return {
    state: {
      account: {
        accountId: openingEvent.payload.accountId as string,
        customerName: openingEvent.payload.customerName as string,
        accountType: openingEvent.payload.accountType as 'checking' | 'savings',
        balance: currentBalance,
        currency: openingEvent.payload.currency as string,
        openedAt: openingEvent.payload.openedAt as Date
      }
    },
    maxSequenceNumber
  };
}