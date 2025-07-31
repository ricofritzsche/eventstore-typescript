import { EventFilter, createFilter, createQuery } from '../../../../eventstore';
import { EventStore } from '../../../../eventstore/types';
import { WithdrawMoneyCommand, WithdrawResult } from './types';
import { foldWithdrawState, decideWithdraw } from './core';
import { MoneyWithdrawnEvent } from './events';

export async function execute(
  eventStore: EventStore,
  command: WithdrawMoneyCommand
): Promise<WithdrawResult> {
  const filter = createQuery(createFilter(
    ['BankAccountOpened', 'MoneyDeposited', 'MoneyWithdrawn', 'MoneyTransferred'],
    [
      { accountId: command.accountId },
      { fromAccountId: command.accountId },
      { toAccountId: command.accountId }
    ]
  ));
  
  const queryResult = await eventStore.query(filter);
  const state = foldWithdrawState(queryResult.events, command.accountId);
  const result = decideWithdraw(command, state);
  
  if (!result.success) {
    return result;
  }

  try {
    const event = new MoneyWithdrawnEvent(
      result.event.accountId,
      result.event.amount,
      result.event.currency,
      result.event.withdrawalId,
      result.event.timestamp
    );
    
    await eventStore.append([event], filter, queryResult.maxSequenceNumber);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'Failed to save withdrawal event' }
    };
  }
}