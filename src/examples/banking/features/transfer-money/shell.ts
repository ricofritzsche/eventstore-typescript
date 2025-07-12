import { EventFilter } from '../../../../eventstore';
import { IEventStore } from '../../../../eventstore/types';
import { TransferMoneyCommand, TransferResult } from './types';
import { processTransferCommand } from './core';
import { MoneyTransferredEvent } from './events';

export async function execute(
  eventStore: IEventStore,
  command: TransferMoneyCommand
): Promise<TransferResult> {
  const transferStateResult = await getTransferState(eventStore, command.fromAccountId, command.toAccountId);
  
  if (!transferStateResult.state.fromAccount) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'From account not found' }
    };
  }

  if (!transferStateResult.state.toAccount) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'To account not found' }
    };
  }

  const effectiveCommand = {
    ...command,
    currency: command.currency || transferStateResult.state.fromAccount.currency
  };

  const result = processTransferCommand(effectiveCommand, transferStateResult.state.fromAccount.balance, transferStateResult.state.existingTransferIds);
  
  if (!result.success) {
    return result;
  }

  try {
    const filter = EventFilter.fromPayloadPredicateOptions(
      ['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred'],
      [
        { accountId: command.fromAccountId },
        { accountId: command.toAccountId },
        { toAccountId: command.fromAccountId },
        { fromAccountId: command.toAccountId }
      ]
    );
    
    const event = new MoneyTransferredEvent(
      result.event.fromAccountId,
      result.event.toAccountId,
      result.event.amount,
      result.event.currency,
      result.event.transferId,
      result.event.timestamp
    );
    
    await eventStore.append(filter, [event], transferStateResult.maxSequenceNumber);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'Failed to save transfer event' }
    };
  }
}


async function getTransferState(eventStore: IEventStore, fromAccountId: string, toAccountId: string): Promise<{
  state: {
    fromAccount: { balance: number; currency: string } | null;
    toAccount: { balance: number; currency: string } | null;
    existingTransferIds: string[];
  };
  maxSequenceNumber: number;
}> {
  const filter = EventFilter.fromPayloadPredicateOptions(
    ['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred'],
    [
      { accountId: fromAccountId },
      { accountId: toAccountId },
      { toAccountId: fromAccountId },
      { fromAccountId: toAccountId }
    ]
  );

  const result = await eventStore.query<any>(filter);
  
  const fromAccount = buildAccountState(result.events, fromAccountId);
  const toAccount = buildAccountState(result.events, toAccountId);
  const existingTransferIds = result.events
    .filter(e => (e.event_type || (e.eventType && e.eventType())) === 'MoneyTransferred')
    .map(e => e.transferId);

  return {
    state: {
      fromAccount,
      toAccount,
      existingTransferIds
    },
    maxSequenceNumber: result.maxSequenceNumber
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