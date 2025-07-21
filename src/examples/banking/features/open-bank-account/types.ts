export interface OpenBankAccountCommand {
  customerName: string;
  accountType?: string;
  initialDeposit?: number;
  currency?: string;
}

export interface BankAccountOpenedEvent {
  type: 'BankAccountOpened';
  accountId: string;
  customerName: string;
  accountType: 'checking' | 'savings';
  initialDeposit: number;
  currency: string;
  openedAt: Date;
}

export type OpenAccountError = 
  | { type: 'InvalidCustomerName'; message: string }
  | { type: 'InvalidAccountType'; message: string }
  | { type: 'InvalidInitialDeposit'; message: string }
  | { type: 'InvalidCurrency'; message: string };

export interface OpenAccountState {
  existingCustomerNames: string[];
}

export type OpenAccountResult = 
  | { success: true; event: BankAccountOpenedEvent }
  | { success: false; error: OpenAccountError };