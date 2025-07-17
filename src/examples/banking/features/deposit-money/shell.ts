import { EventFilter, createFilter } from '../../../../eventstore';
import { EventStore } from '../../../../eventstore';
import { DepositMoneyCommand, DepositResult } from './types';
import { processDepositCommand } from './core';
import { MoneyDepositedEvent } from './events';

export async function execute(
  eventStore: EventStore,
  command: DepositMoneyCommand
): Promise<DepositResult> {
  const depositStateResult = await getDepositState(eventStore, command.accountId);
  
  if (!depositStateResult.state.account) {
    return {
      success: false,
      error: { type: 'InvalidAmount', message: 'Account not found' }
    };
  }

  const effectiveCommand = {
    ...command,
    currency: command.currency || depositStateResult.state.account.currency
  };

  const result = processDepositCommand(effectiveCommand, depositStateResult.state.existingDepositIds);
  
  if (!result.success) {
    return result;
  }

  try {
    const filter = createFilter(['BankAccountOpened', 'MoneyDeposited'], [{ accountId: command.accountId }]);
    
    const event = new MoneyDepositedEvent(
      result.event.accountId,
      result.event.amount,
      result.event.currency,
      result.event.depositId,
      result.event.timestamp
    );
    
    await eventStore.append([event], filter, depositStateResult.maxSequenceNumber);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InvalidAmount', message: 'Failed to save deposit event' }
    };
  }
}

async function getDepositState(eventStore: EventStore, accountId: string): Promise<{
  state: {
    account: { currency: string } | null;
    existingDepositIds: string[];
  };
  maxSequenceNumber: number;
}> {
  const filter = createFilter(['BankAccountOpened', 'MoneyDeposited'], [{ accountId: accountId }]);
  
  const result = await eventStore.query(filter);
  
  const openingEvent = result.events.find(e => 
    e.eventType === 'BankAccountOpened'
  );
  
  const account = openingEvent ? { currency: openingEvent.payload.currency as string } : null;
  const existingDepositIds = result.events
    .filter(e => e.eventType === 'MoneyDeposited')
    .map(e => e.payload.depositId as string);

  return {
    state: {
      account,
      existingDepositIds
    },
    maxSequenceNumber: result.maxSequenceNumber
  };
}