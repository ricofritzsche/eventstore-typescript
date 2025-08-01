import { createFilter, createQuery } from '../../../../eventstore';
import { EventStore } from '../../../../eventstore/types';
import { TransferMoneyCommand, TransferResult } from './types';
import { foldTransferState, decideTransfer } from './core';
import { MoneyTransferredEvent } from './events';

export async function execute(
  eventStore: EventStore,
  command: TransferMoneyCommand
): Promise<TransferResult> {
  const filter = createQuery(createFilter(
    ['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred'],
    [
      { accountId: command.fromAccountId },
      { accountId: command.toAccountId },
      { toAccountId: command.fromAccountId },
      { fromAccountId: command.toAccountId }
    ]
  ));
  
  const queryResult = await eventStore.query(filter);
  const state = foldTransferState(queryResult.events, command.fromAccountId, command.toAccountId);
  const result = decideTransfer(command, state);
  
  if (!result.success) {
    return result;
  }

  try {
    const event = new MoneyTransferredEvent(
      result.event.fromAccountId,
      result.event.toAccountId,
      result.event.amount,
      result.event.currency,
      result.event.transferId,
      result.event.timestamp
    );
    
    await eventStore.append([event], filter, queryResult.maxSequenceNumber);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'Failed to save transfer event' }
    };
  }
}


