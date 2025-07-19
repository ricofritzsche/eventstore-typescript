export interface Account {
  accountId: string;
  customerName: string;
  accountType: 'checking' | 'savings';
  balance: number;
  currency: string;
  openedAt: Date;
  lastUpdatedAt: Date;
}

export interface AccountsQuery {
  accountId?: string;
  customerName?: string;
  accountType?: 'checking' | 'savings';
  currency?: string;
}

export interface AccountsResult {
  accounts: Account[];
  totalCount: number;
}