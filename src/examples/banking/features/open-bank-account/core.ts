import { OpenBankAccountCommand, BankAccountOpenedEvent, OpenAccountError, OpenAccountResult, OpenAccountState } from './types';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP'];
const SUPPORTED_ACCOUNT_TYPES = ['checking', 'savings'];
const MAX_INITIAL_DEPOSIT = 1000000;

export function validateOpenAccountCommand(command: OpenBankAccountCommand): OpenAccountError | null {
  if (!command.customerName || command.customerName.trim().length === 0) {
    return { type: 'InvalidCustomerName', message: 'Customer name is required' };
  }

  if (command.customerName.trim().length < 2) {
    return { type: 'InvalidCustomerName', message: 'Customer name must be at least 2 characters' };
  }

  if (command.accountType && !SUPPORTED_ACCOUNT_TYPES.includes(command.accountType)) {
    return { type: 'InvalidAccountType', message: `Account type must be one of: ${SUPPORTED_ACCOUNT_TYPES.join(', ')}` };
  }

  const initialDeposit = command.initialDeposit ?? 0;
  
  if (initialDeposit < 0) {
    return { type: 'InvalidInitialDeposit', message: 'Initial deposit cannot be negative' };
  }

  if (initialDeposit > MAX_INITIAL_DEPOSIT) {
    return { type: 'InvalidInitialDeposit', message: `Initial deposit cannot exceed ${MAX_INITIAL_DEPOSIT}` };
  }

  if (command.currency && !SUPPORTED_CURRENCIES.includes(command.currency)) {
    return { type: 'InvalidCurrency', message: `Currency ${command.currency} is not supported` };
  }

  return null;
}

export function foldOpenAccountState(events: any[]): OpenAccountState {
  const existingCustomerNames = events
    .filter(e => e.eventType === 'BankAccountOpened')
    .map(e => e.payload.customerName as string);

  return {
    existingCustomerNames
  };
}

export function decideOpenAccount(
  command: OpenBankAccountCommand,
  accountId: string,
  state: OpenAccountState
): OpenAccountResult {
  const accountType = command.accountType || 'checking';
  
  if (!SUPPORTED_ACCOUNT_TYPES.includes(accountType)) {
    return { 
      success: false, 
      error: { type: 'InvalidAccountType', message: `Account type must be one of: ${SUPPORTED_ACCOUNT_TYPES.join(', ')}` }
    };
  }

  const commandWithDefaults = {
    ...command,
    accountType: accountType as 'checking' | 'savings',
    currency: command.currency || 'USD'
  };

  const validationError = validateOpenAccountCommand(commandWithDefaults);
  if (validationError) {
    return { success: false, error: validationError };
  }

  if (state.existingCustomerNames.includes(commandWithDefaults.customerName.trim())) {
    return { 
      success: false, 
      error: { type: 'InvalidCustomerName', message: 'Customer name already exists' } 
    };
  }

  const event: BankAccountOpenedEvent = {
    type: 'BankAccountOpened',
    accountId: accountId,
    customerName: commandWithDefaults.customerName.trim(),
    accountType: commandWithDefaults.accountType,
    initialDeposit: commandWithDefaults.initialDeposit ?? 0,
    currency: commandWithDefaults.currency,
    openedAt: new Date()
  };

  return { success: true, event };
}

