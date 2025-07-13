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
    
    await eventStore.append(filter, [event], depositStateResult.maxSequenceNumber);
    
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
  
  const result = await eventStore.query<any>(filter);
  
  const openingEvent = result.events.find(e => 
    (e.event_type || (e.eventType && e.eventType())) === 'BankAccountOpened'
  );
  
  const account = openingEvent ? { currency: openingEvent.currency } : null;
  const existingDepositIds = result.events
    .filter(e => (e.event_type || (e.eventType && e.eventType())) === 'MoneyDeposited')
    .map(e => e.depositId);

  return {
    state: {
      account,
      existingDepositIds
    },
    maxSequenceNumber: result.maxSequenceNumber
  };
}