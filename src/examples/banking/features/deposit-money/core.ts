import { DepositMoneyCommand, MoneyDepositedEvent, AccountBalance, DepositError, DepositResult } from './types';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP'];
const MIN_DEPOSIT_AMOUNT = 0.01;
const MAX_DEPOSIT_AMOUNT = 1000000;

export function validateDepositCommand(command: DepositMoneyCommand): DepositError | null {
  if (command.amount <= 0) {
    return { type: 'InvalidAmount', message: 'Deposit amount must be positive' };
  }

  if (command.amount < MIN_DEPOSIT_AMOUNT) {
    return { type: 'InvalidAmount', message: `Minimum deposit amount is ${MIN_DEPOSIT_AMOUNT}` };
  }

  if (command.amount > MAX_DEPOSIT_AMOUNT) {
    return { type: 'InvalidAmount', message: `Maximum deposit amount is ${MAX_DEPOSIT_AMOUNT}` };
  }

  if (command.currency && !SUPPORTED_CURRENCIES.includes(command.currency)) {
    return { type: 'InvalidCurrency', message: `Currency ${command.currency} is not supported` };
  }

  return null;
}

export function processDepositCommand(
  command: DepositMoneyCommand,
  existingDepositIds: string[]
): DepositResult {
  const validationError = validateDepositCommand(command);
  if (validationError) {
    return { success: false, error: validationError };
  }

  if (existingDepositIds.includes(command.depositId)) {
    return { 
      success: false, 
      error: { type: 'DuplicateDeposit', message: 'Deposit ID already exists' } 
    };
  }

  const event: MoneyDepositedEvent = {
    type: 'MoneyDeposited',
    accountId: command.accountId,
    amount: command.amount,
    currency: command.currency || 'USD',
    depositId: command.depositId,
    timestamp: new Date()
  };

  return { success: true, event };
}

export function foldMoneyDepositedEvents(events: MoneyDepositedEvent[]): AccountBalance | null {
  if (events.length === 0) {
    return null;
  }

  const firstEvent = events[0]!;
  const totalAmount = events.reduce((sum, event) => sum + event.amount, 0);

  return {
    accountId: firstEvent.accountId,
    balance: totalAmount,
    currency: firstEvent.currency
  };
}