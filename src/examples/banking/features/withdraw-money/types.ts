export interface WithdrawMoneyCommand {
  accountId: string;
  amount: number;
  currency?: string;
  withdrawalId: string;
}

export interface MoneyWithdrawnEvent {
  type: 'MoneyWithdrawn';
  accountId: string;
  amount: number;
  currency: string;
  withdrawalId: string;
  timestamp: Date;
}

export type WithdrawError = 
  | { type: 'InvalidAmount'; message: string }
  | { type: 'InvalidCurrency'; message: string }
  | { type: 'InsufficientFunds'; message: string }
  | { type: 'DuplicateWithdrawal'; message: string };

export type WithdrawResult = 
  | { success: true; event: MoneyWithdrawnEvent }
  | { success: false; error: WithdrawError };