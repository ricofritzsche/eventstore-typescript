import { WithdrawMoneyCommand, MoneyWithdrawnEvent, WithdrawError, WithdrawResult } from './types';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP'];
const MIN_WITHDRAWAL_AMOUNT = 0.01;
const MAX_WITHDRAWAL_AMOUNT = 10000;

export function validateWithdrawCommand(command: WithdrawMoneyCommand): WithdrawError | null {
  if (command.amount <= 0) {
    return { type: 'InvalidAmount', message: 'Withdrawal amount must be positive' };
  }

  if (command.amount < MIN_WITHDRAWAL_AMOUNT) {
    return { type: 'InvalidAmount', message: `Minimum withdrawal amount is ${MIN_WITHDRAWAL_AMOUNT}` };
  }

  if (command.amount > MAX_WITHDRAWAL_AMOUNT) {
    return { type: 'InvalidAmount', message: `Maximum withdrawal amount is ${MAX_WITHDRAWAL_AMOUNT}` };
  }

  if (command.currency && !SUPPORTED_CURRENCIES.includes(command.currency)) {
    return { type: 'InvalidCurrency', message: `Currency ${command.currency} is not supported` };
  }

  return null;
}

export function processWithdrawCommand(
  command: WithdrawMoneyCommand,
  currentBalance: number,
  existingWithdrawalIds: string[]
): WithdrawResult {
  const validationError = validateWithdrawCommand(command);
  if (validationError) {
    return { success: false, error: validationError };
  }

  if (existingWithdrawalIds.includes(command.withdrawalId)) {
    return { 
      success: false, 
      error: { type: 'DuplicateWithdrawal', message: 'Withdrawal ID already exists' } 
    };
  }

  if (currentBalance < command.amount) {
    return { 
      success: false, 
      error: { type: 'InsufficientFunds', message: 'Insufficient funds for withdrawal' } 
    };
  }

  const event: MoneyWithdrawnEvent = {
    type: 'MoneyWithdrawn',
    accountId: command.accountId,
    amount: command.amount,
    currency: command.currency || 'USD',
    withdrawalId: command.withdrawalId,
    timestamp: new Date()
  };

  return { success: true, event };
}