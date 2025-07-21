import { TransferMoneyCommand, MoneyTransferredEvent, TransferError, TransferResult, AccountState, TransferState } from './types';

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

export function foldTransferState(events: any[], fromAccountId: string, toAccountId: string): TransferState {
  const fromAccount = foldAccountEvents(events, fromAccountId);
  const toAccount = foldAccountEvents(events, toAccountId);
  const existingTransferIds = events
    .filter(e => e.eventType === 'MoneyTransferred')
    .map(e => e.payload.transferId as string);

  return {
    fromAccount,
    toAccount,
    existingTransferIds
  };
}

export function decideTransfer(
  command: TransferMoneyCommand,
  state: TransferState
): TransferResult {
  const validationError = validateTransferCommand(command);
  if (validationError) {
    return { success: false, error: validationError };
  }

  if (!state.fromAccount) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'From account not found' }
    };
  }

  if (!state.toAccount) {
    return {
      success: false,
      error: { type: 'InsufficientFunds', message: 'To account not found' }
    };
  }

  if (state.existingTransferIds.includes(command.transferId)) {
    return { 
      success: false, 
      error: { type: 'DuplicateTransfer', message: 'Transfer ID already exists' } 
    };
  }

  if (state.fromAccount.balance < command.amount) {
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
    currency: command.currency || state.fromAccount.currency,
    transferId: command.transferId,
    timestamp: new Date()
  };

  return { success: true, event };
}

