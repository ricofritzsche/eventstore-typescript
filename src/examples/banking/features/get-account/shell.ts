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
  
  const result = await eventStore.query<any>(filter);
  const allEvents = result.events;
  
  const openingEvent = allEvents.find(e => 
    (e.event_type || (e.eventType && e.eventType())) === 'BankAccountOpened'
  );
  
  if (!openingEvent) {
    return { 
      state: { account: null },
      maxSequenceNumber: result.maxSequenceNumber
    };
  }

  let currentBalance = openingEvent.initialDeposit;

  for (const event of allEvents) {
    const eventType = event.event_type || (event.eventType && event.eventType());
    
    if (eventType === 'MoneyDeposited' && event.currency === openingEvent.currency) {
      currentBalance += event.amount;
    } else if (eventType === 'MoneyWithdrawn' && event.currency === openingEvent.currency) {
      currentBalance -= event.amount;
    } else if (eventType === 'MoneyTransferred' && event.currency === openingEvent.currency) {
      if (event.fromAccountId === accountId) {
        currentBalance -= event.amount;
      } else if (event.toAccountId === accountId) {
        currentBalance += event.amount;
      }
    }
  }

  const maxSequenceNumber = result.maxSequenceNumber;

  return {
    state: {
      account: {
        accountId: openingEvent.accountId,
        customerName: openingEvent.customerName,
        accountType: openingEvent.accountType,
        balance: currentBalance,
        currency: openingEvent.currency,
        openedAt: openingEvent.openedAt
      }
    },
    maxSequenceNumber
  };
}