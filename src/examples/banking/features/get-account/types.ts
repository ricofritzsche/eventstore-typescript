export interface BankAccount {
  accountId: string;
  customerName: string;
  accountType: 'checking' | 'savings';
  balance: number;
  currency: string;
  openedAt: Date;
}

export interface GetAccountQuery {
  accountId: string;
}

export type GetAccountResult = BankAccount | null;