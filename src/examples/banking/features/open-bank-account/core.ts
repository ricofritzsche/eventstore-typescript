import { OpenBankAccountCommand, BankAccountOpenedEvent, OpenAccountError, OpenAccountResult } from './types';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP'];
const MAX_INITIAL_DEPOSIT = 1000000;

export function validateOpenAccountCommand(command: OpenBankAccountCommand): OpenAccountError | null {
  if (!command.customerName || command.customerName.trim().length === 0) {
    return { type: 'InvalidCustomerName', message: 'Customer name is required' };
  }

  if (command.customerName.trim().length < 2) {
    return { type: 'InvalidCustomerName', message: 'Customer name must be at least 2 characters' };
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

export function processOpenAccountCommand(
  command: OpenBankAccountCommand,
  accountId: string,
  existingCustomerNames?: string[]
): OpenAccountResult {
  const commandWithDefaults = {
    ...command,
    accountType: command.accountType || 'checking',
    currency: command.currency || 'USD'
  };

  const validationError = validateOpenAccountCommand(commandWithDefaults);
  if (validationError) {
    return { success: false, error: validationError };
  }

  if (existingCustomerNames && existingCustomerNames.includes(commandWithDefaults.customerName.trim())) {
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