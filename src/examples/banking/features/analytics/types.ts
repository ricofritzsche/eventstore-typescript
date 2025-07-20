export interface MonthlyAccountStats {
  year: number;
  month: number;
  accountOpenings: number;
  totalAccounts: number;
  monthName: string;
}

export interface AnalyticsQuery {
  year?: number;
  months?: number; // How many recent months to show
}

export interface AnalyticsResult {
  monthlyStats: MonthlyAccountStats[];
  totalCount: number;
}