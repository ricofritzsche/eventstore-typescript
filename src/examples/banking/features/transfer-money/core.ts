import { TransferMoneyCommand, MoneyTransferredEvent, TransferError, TransferResult } from './types';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP'];
const MIN_TRANSFER_AMOUNT = 0.01;
const MAX_TRANSFER_AMOUNT = 50000;

export function validateTransferCommand(command: TransferMoneyCommand): TransferError | null {
  if (command.fromAccountId === command.toAccountId) {
    return { type: 'SameAccount', message: 'Cannot transfer to the same account' };
  }

  if (command.amount <= 0) {
    return { type: 'InvalidAmount', message: 'Transfer amount must be positive' };
  }

  if (command.amount < MIN_TRANSFER_AMOUNT) {
    return { type: 'InvalidAmount', message: `Minimum transfer amount is ${MIN_TRANSFER_AMOUNT}` };
  }

  if (command.amount > MAX_TRANSFER_AMOUNT) {
    return { type: 'InvalidAmount', message: `Maximum transfer amount is ${MAX_TRANSFER_AMOUNT}` };
  }

  if (command.currency && !SUPPORTED_CURRENCIES.includes(command.currency)) {
    return { type: 'InvalidCurrency', message: `Currency ${command.currency} is not supported` };
  }

  return null;
}

export function processTransferCommand(
  command: TransferMoneyCommand,
  fromAccountBalance: number,
  existingTransferIds: string[]
): TransferResult {
  const validationError = validateTransferCommand(command);
  if (validationError) {
    return { success: false, error: validationError };
  }

  if (existingTransferIds.includes(command.transferId)) {
    return { 
      success: false, 
      error: { type: 'DuplicateTransfer', message: 'Transfer ID already exists' } 
    };
  }

  if (fromAccountBalance < command.amount) {
    return { 
      success: false, 
      error: { type: 'InsufficientFunds', message: 'Insufficient funds for transfer' } 
    };
  }

  const event: MoneyTransferredEvent = {
    type: 'MoneyTransferred',
    fromAccountId: command.fromAccountId,
    toAccountId: command.toAccountId,
    amount: command.amount,
    currency: command.currency || 'USD',
    transferId: command.transferId,
    timestamp: new Date()
  };

  return { success: true, event };
}