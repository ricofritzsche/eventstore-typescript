export interface TransferMoneyCommand {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency?: string;
  transferId: string;
}

export interface AccountState {
  exists: boolean;
  balance: number;
  currency: string;
}

export interface TransferState {
  fromAccount: AccountState | null;
  toAccount: AccountState | null;
  existingTransferIds: string[];
}

export interface MoneyTransferredEvent {
  type: 'MoneyTransferred';
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  transferId: string;
  timestamp: Date;
}

export type TransferError = 
  | { type: 'InvalidAmount'; message: string }
  | { type: 'InvalidCurrency'; message: string }
  | { type: 'InsufficientFunds'; message: string }
  | { type: 'SameAccount'; message: string }
  | { type: 'DuplicateTransfer'; message: string };

export type TransferResult = 
  | { success: true; event: MoneyTransferredEvent }
  | { success: false; error: TransferError };