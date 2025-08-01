import { EventFilter, createFilter, createQuery } from '../../../../eventstore';
import { EventStore } from '../../../../eventstore/types';
import { OpenBankAccountCommand, OpenAccountResult } from './types';
import { foldOpenAccountState, decideOpenAccount } from './core';
import { BankAccountOpenedEvent } from './events';
import { v4 as uuidv4 } from 'uuid';

export async function execute(
  eventStore: EventStore,
  command: OpenBankAccountCommand
): Promise<OpenAccountResult> {
  const accountId = uuidv4();
  
  const filter = createQuery(createFilter(['BankAccountOpened']));
  const queryResult = await eventStore.query(filter);
  const state = foldOpenAccountState(queryResult.events);
  const result = decideOpenAccount(command, accountId, state);
  
  if (!result.success) {
    return result;
  }

  try {
    const event = new BankAccountOpenedEvent(
      result.event.accountId,
      result.event.customerName,
      result.event.accountType,
      result.event.initialDeposit,
      result.event.currency,
      result.event.openedAt
    );
    
    await eventStore.append([event], filter, queryResult.maxSequenceNumber);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InvalidCustomerName', message: 'Failed to save account opening event' }
    };
  }
}


