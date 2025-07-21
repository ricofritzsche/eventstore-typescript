export interface DepositMoneyCommand {
  accountId: string;
  amount: number;
  currency?: string;
  depositId: string;
}

export interface MoneyDepositedEvent {
  type: 'MoneyDeposited';
  accountId: string;
  amount: number;
  currency: string;
  depositId: string;
  timestamp: Date;
}

export interface AccountBalance {
  accountId: string;
  balance: number;
  currency: string;
}

export type DepositError = 
  | { type: 'InvalidAmount'; message: string }
  | { type: 'InvalidCurrency'; message: string }
  | { type: 'DuplicateDeposit'; message: string };

export interface DepositState {
  account: { currency: string } | null;
  existingDepositIds: string[];
}

export type DepositResult = 
  | { success: true; event: MoneyDepositedEvent }
  | { success: false; error: DepositError };