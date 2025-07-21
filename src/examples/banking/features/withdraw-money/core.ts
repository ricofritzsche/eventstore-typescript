import { WithdrawMoneyCommand, MoneyWithdrawnEvent, WithdrawError, WithdrawResult, AccountState, WithdrawState } from './types';

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

export function foldAccountEvents(events: any[], accountId: string): AccountState | null {
  const openingEvent = events.find(e => 
    e.eventType === 'BankAccountOpened' && e.payload.accountId === accountId
  );
  
  if (!openingEvent) {
    return null;
  }

  let currentBalance = openingEvent.payload.initialDeposit as number;
  const currency = openingEvent.payload.currency as string;

  for (const event of events) {
    const eventType = event.eventType;
    
    if (eventType === 'MoneyDeposited' && event.payload.accountId === accountId && event.payload.currency === currency) {
      currentBalance += event.payload.amount as number;
    } else if (eventType === 'MoneyWithdrawn' && event.payload.accountId === accountId && event.payload.currency === currency) {
      currentBalance -= event.payload.amount as number;
    } else if (eventType === 'MoneyTransferred' && event.payload.currency === currency) {
      if (event.payload.fromAccountId === accountId) {
        currentBalance -= event.payload.amount as number;
      } else if (event.payload.toAccountId === accountId) {
        currentBalance += event.payload.amount as number;
      }
    }
  }

  return {
    exists: true,
    balance: currentBalance,
    currency
  };
}

export function foldWithdrawState(events: any[], accountId: string): WithdrawState {
  const account = foldAccountEvents(events, accountId);
  const existingWithdrawalIds = events
    .filter(e => e.eventType === 'MoneyWithdrawn')
    .map(e => e.payload.withdrawalId as string);

  return {
    account,
    existingWithdrawalIds
  };
}

export function decideWithdraw(
  command: WithdrawMoneyCommand,
  state: WithdrawState
): WithdrawResult {
  const validationError = validateWithdrawCommand(command);
  if (validationError) {
    return { success: false, error: validationError };
  }

  if (!state.account) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'Account not found' }
    };
  }

  if (state.existingWithdrawalIds.includes(command.withdrawalId)) {
    return { 
      success: false, 
      error: { type: 'DuplicateWithdrawal', message: 'Withdrawal ID already exists' } 
    };
  }

  if (state.account.balance < command.amount) {
    return { 
      success: false, 
      error: { type: 'InsufficientFunds', message: 'Insufficient funds for withdrawal' } 
    };
  }

  const event: MoneyWithdrawnEvent = {
    type: 'MoneyWithdrawn',
    accountId: command.accountId,
    amount: command.amount,
    currency: command.currency || state.account.currency,
    withdrawalId: command.withdrawalId,
    timestamp: new Date()
  };

  return { success: true, event };
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