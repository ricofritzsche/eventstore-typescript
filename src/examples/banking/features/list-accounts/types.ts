export interface Account {
  accountId: string;
  customerName: string;
  accountType: 'checking' | 'savings';
  balance: number;
  currency: string;
  openedAt: Date;
  lastUpdatedAt: Date;
  lastEventSequenceNumber: number;
}

export interface AccountsResult {
  accounts: Account[];
  totalCount: number;
}