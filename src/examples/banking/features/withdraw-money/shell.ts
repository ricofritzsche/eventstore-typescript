import { EventFilter, createFilter } from '../../../../eventstore';
import { EventStore } from '../../../../eventstore/types';
import { WithdrawMoneyCommand, WithdrawResult } from './types';
import { processWithdrawCommand } from './core';
import { MoneyWithdrawnEvent } from './events';

export async function execute(
  eventStore: EventStore,
  command: WithdrawMoneyCommand
): Promise<WithdrawResult> {
  const withdrawStateResult = await getWithdrawState(eventStore, command.accountId);
  
  if (!withdrawStateResult.state.account) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'Account not found' }
    };
  }

  const effectiveCommand = {
    ...command,
    currency: command.currency || withdrawStateResult.state.account.currency
  };

  const result = processWithdrawCommand(effectiveCommand, withdrawStateResult.state.account.balance, withdrawStateResult.state.existingWithdrawalIds);
  
  if (!result.success) {
    return result;
  }

  try {
    // Use a filter that captures all events that affect the account balance
    // This matches the scope of events considered in getWithdrawState
    const filter = createFilter(
      ['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred'],
      [
        { accountId: command.accountId },
        { fromAccountId: command.accountId },
        { toAccountId: command.accountId }
      ]
    );
    
    const event = new MoneyWithdrawnEvent(
      result.event.accountId,
      result.event.amount,
      result.event.currency,
      result.event.withdrawalId,
      result.event.timestamp
    );
    
    await eventStore.append(filter, [event], withdrawStateResult.maxSequenceNumber);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'Failed to save withdrawal event' }
    };
  }
}


async function getWithdrawState(eventStore: EventStore, accountId: string): Promise<{
  state: {
    account: { balance: number; currency: string } | null;
    existingWithdrawalIds: string[];
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
  const account = buildAccountState(allEvents, accountId);
  const existingWithdrawalIds = allEvents
    .filter(e => (e.event_type || (e.eventType && e.eventType())) === 'MoneyWithdrawn')
    .map(e => e.withdrawalId);

  const maxSequenceNumber = result.maxSequenceNumber;

  return {
    state: {
      account,
      existingWithdrawalIds
    },
    maxSequenceNumber
  };
}

function buildAccountState(events: any[], accountId: string): { balance: number; currency: string } | null {
  const openingEvent = events.find(e => 
    (e.event_type || (e.eventType && e.eventType())) === 'BankAccountOpened' && e.accountId === accountId
  );
  
  if (!openingEvent) {
    return null;
  }

  let currentBalance = openingEvent.initialDeposit;

  for (const event of events) {
    const eventType = event.event_type || (event.eventType && event.eventType());
    
    if (eventType === 'MoneyDeposited' && event.accountId === accountId && event.currency === openingEvent.currency) {
      currentBalance += event.amount;
    } else if (eventType === 'MoneyWithdrawn' && event.accountId === accountId && event.currency === openingEvent.currency) {
      currentBalance -= event.amount;
    } else if (eventType === 'MoneyTransferred' && event.currency === openingEvent.currency) {
      if (event.fromAccountId === accountId) {
        currentBalance -= event.amount;
      } else if (event.toAccountId === accountId) {
        currentBalance += event.amount;
      }
    }
  }

  return {
    balance: currentBalance,
    currency: openingEvent.currency
  };
}