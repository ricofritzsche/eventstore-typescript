import { EventFilter, createFilter, createQuery } from '../../../../eventstore';
import { EventStore } from '../../../../eventstore';
import { DepositMoneyCommand, DepositResult } from './types';
import { foldDepositState, decideDeposit } from './core';
import { MoneyDepositedEvent } from './events';

export async function execute(
  eventStore: EventStore,
  command: DepositMoneyCommand
): Promise<DepositResult> {
  const filter = createQuery(createFilter(['BankAccountOpened', 'MoneyDeposited'], [{ accountId: command.accountId }]));
  const queryResult = await eventStore.query(filter);
  const state = foldDepositState(queryResult.events, command.accountId);
  const result = decideDeposit(command, state);
  
  if (!result.success) {
    return result;
  }

  try {
    const event = new MoneyDepositedEvent(
      result.event.accountId,
      result.event.amount,
      result.event.currency,
      result.event.depositId,
      result.event.timestamp
    );
    
    await eventStore.append([event], filter, queryResult.maxSequenceNumber);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InvalidAmount', message: 'Failed to save deposit event' }
    };
  }
}

