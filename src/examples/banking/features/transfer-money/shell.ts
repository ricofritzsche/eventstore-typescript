import { createFilter } from '../../../../eventstore';
import { EventStore } from '../../../../eventstore/types';
import { TransferMoneyCommand, TransferResult } from './types';
import { processTransferCommand } from './core';
import { MoneyTransferredEvent } from './events';

export async function execute(
  eventStore: EventStore,
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
    const filter = createFilter(
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
    
    await eventStore.append([event], filter, transferStateResult.maxSequenceNumber);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'Failed to save transfer event' }
    };
  }
}


async function getTransferState(eventStore: EventStore, fromAccountId: string, toAccountId: string): Promise<{
  state: {
    fromAccount: { balance: number; currency: string } | null;
    toAccount: { balance: number; currency: string } | null;
    existingTransferIds: string[];
  };
  maxSequenceNumber: number;
}> {
  const filter = createFilter(
    ['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred'],
    [
      { accountId: fromAccountId },
      { accountId: toAccountId },
      { toAccountId: fromAccountId },
      { fromAccountId: toAccountId }
    ]
  );

  const result = await eventStore.query(filter);
  
  const fromAccount = buildAccountState(result.events, fromAccountId);
  const toAccount = buildAccountState(result.events, toAccountId);
  const existingTransferIds = result.events
    .filter(e => e.eventType === 'MoneyTransferred')
    .map(e => e.payload.transferId as string);

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
    e.eventType === 'BankAccountOpened' && e.payload.accountId === accountId
  );
  
  if (!openingEvent) {
    return null;
  }

  let currentBalance = openingEvent.payload.initialDeposit as number;

  for (const event of events) {
    const eventType = event.eventType;
    
    if (eventType === 'MoneyDeposited' && event.payload.accountId === accountId && event.payload.currency === openingEvent.payload.currency) {
      currentBalance += event.payload.amount as number;
    } else if (eventType === 'MoneyWithdrawn' && event.payload.accountId === accountId && event.payload.currency === openingEvent.payload.currency) {
      currentBalance -= event.payload.amount as number;
    } else if (eventType === 'MoneyTransferred' && event.payload.currency === openingEvent.payload.currency) {
      if (event.payload.fromAccountId === accountId) {
        currentBalance -= event.payload.amount as number;
      } else if (event.payload.toAccountId === accountId) {
        currentBalance += event.payload.amount as number;
      }
    }
  }

  return {
    balance: currentBalance,
    currency: openingEvent.payload.currency as string
  };
}