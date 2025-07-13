import { EventFilter, createFilter } from '../../../../eventstore';
import { EventStore } from '../../../../eventstore/types';
import { OpenBankAccountCommand, OpenAccountResult } from './types';
import { processOpenAccountCommand } from './core';
import { BankAccountOpenedEvent } from './events';
import { v4 as uuidv4 } from 'uuid';

export async function execute(
  eventStore: EventStore,
  command: OpenBankAccountCommand
): Promise<OpenAccountResult> {
  const accountId = uuidv4();
  
  const openAccountState = await getOpenAccountState(eventStore, command.customerName);
  
  const result = processOpenAccountCommand(command, accountId, openAccountState.state.existingCustomerNames);
  
  if (!result.success) {
    return result;
  }

  try {
    const appendFilter = createFilter(['BankAccountOpened']);
    
    const event = new BankAccountOpenedEvent(
      result.event.accountId,
      result.event.customerName,
      result.event.accountType,
      result.event.initialDeposit,
      result.event.currency,
      result.event.openedAt
    );
    
    await eventStore.append(appendFilter, [event], openAccountState.maxSequenceNumber);
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: { type: 'InvalidCustomerName', message: 'Failed to save account opening event' }
    };
  }
}

async function getOpenAccountState(eventStore: EventStore, customerName: string): Promise<{
  state: {
    existingCustomerNames: string[];
  };
  maxSequenceNumber: number;
}> {
  const filter = createFilter(['BankAccountOpened']);
  
  const result = await eventStore.query<any>(filter);
  
  const existingCustomerNames = result.events.map(e => e.customerName);

  return {
    state: {
      existingCustomerNames
    },
    maxSequenceNumber: result.maxSequenceNumber
  };
}

