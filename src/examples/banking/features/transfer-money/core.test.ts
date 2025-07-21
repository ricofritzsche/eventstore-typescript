import { foldAccountEvents, foldTransferState, decideTransfer, validateTransferCommand } from './core';
import { TransferMoneyCommand, TransferState, AccountState } from './types';

describe('transfer-money core', () => {
  describe('foldAccountEvents', () => {
    it('should return null for no BankAccountOpened event', () => {
      const events = [
        { eventType: 'MoneyDeposited', payload: { accountId: 'acc-1', amount: 100 } }
      ];
      
      const result = foldAccountEvents(events, 'acc-1');
      expect(result).toBeNull();
    });

    it('should calculate balance from account events', () => {
      const events = [
        { eventType: 'BankAccountOpened', payload: { accountId: 'acc-1', initialDeposit: 1000, currency: 'USD' } },
        { eventType: 'MoneyDeposited', payload: { accountId: 'acc-1', amount: 200, currency: 'USD' } },
        { eventType: 'MoneyWithdrawn', payload: { accountId: 'acc-1', amount: 150, currency: 'USD' } }
      ];
      
      const result = foldAccountEvents(events, 'acc-1');
      expect(result).toEqual({
        exists: true,
        balance: 1050,
        currency: 'USD'
      });
    });

    it('should handle money transfers affecting balance', () => {
      const events = [
        { eventType: 'BankAccountOpened', payload: { accountId: 'acc-1', initialDeposit: 1000, currency: 'USD' } },
        { eventType: 'MoneyTransferred', payload: { fromAccountId: 'acc-1', toAccountId: 'acc-2', amount: 200, currency: 'USD' } },
        { eventType: 'MoneyTransferred', payload: { fromAccountId: 'acc-2', toAccountId: 'acc-1', amount: 50, currency: 'USD' } }
      ];
      
      const result = foldAccountEvents(events, 'acc-1');
      expect(result).toEqual({
        exists: true,
        balance: 850,
        currency: 'USD'
      });
    });

    it('should filter events by currency', () => {
      const events = [
        { eventType: 'BankAccountOpened', payload: { accountId: 'acc-1', initialDeposit: 1000, currency: 'USD' } },
        { eventType: 'MoneyDeposited', payload: { accountId: 'acc-1', amount: 200, currency: 'EUR' } },
        { eventType: 'MoneyDeposited', payload: { accountId: 'acc-1', amount: 100, currency: 'USD' } }
      ];
      
      const result = foldAccountEvents(events, 'acc-1');
      expect(result?.balance).toBe(1100);
    });
  });

  describe('foldTransferState', () => {
    it('should combine both account states and existing transfer IDs', () => {
      const events = [
        { eventType: 'BankAccountOpened', payload: { accountId: 'acc-1', initialDeposit: 1000, currency: 'USD' } },
        { eventType: 'BankAccountOpened', payload: { accountId: 'acc-2', initialDeposit: 500, currency: 'USD' } },
        { eventType: 'MoneyTransferred', payload: { transferId: 'trans-1' } },
        { eventType: 'MoneyTransferred', payload: { transferId: 'trans-2' } }
      ];
      
      const result = foldTransferState(events, 'acc-1', 'acc-2');
      expect(result.fromAccount).toEqual({
        exists: true,
        balance: 1000,
        currency: 'USD'
      });
      expect(result.toAccount).toEqual({
        exists: true,
        balance: 500,
        currency: 'USD'
      });
      expect(result.existingTransferIds).toEqual(['trans-1', 'trans-2']);
    });

    it('should handle case when accounts do not exist', () => {
      const events = [
        { eventType: 'MoneyTransferred', payload: { transferId: 'trans-1' } }
      ];
      
      const result = foldTransferState(events, 'acc-1', 'acc-2');
      expect(result.fromAccount).toBeNull();
      expect(result.toAccount).toBeNull();
      expect(result.existingTransferIds).toEqual(['trans-1']);
    });
  });

  describe('validateTransferCommand', () => {
    it('should return null for valid command', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100,
        currency: 'USD',
        transferId: 'trans-1'
      };
      
      const result = validateTransferCommand(command);
      expect(result).toBeNull();
    });

    it('should return error for same account transfer', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-1',
        amount: 100,
        transferId: 'trans-1'
      };
      
      const result = validateTransferCommand(command);
      expect(result).toEqual({
        type: 'SameAccount',
        message: 'Cannot transfer to the same account'
      });
    });

    it('should return error for zero amount', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 0,
        transferId: 'trans-1'
      };
      
      const result = validateTransferCommand(command);
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Transfer amount must be positive'
      });
    });

    it('should return error for amount below minimum', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 0.005,
        transferId: 'trans-1'
      };
      
      const result = validateTransferCommand(command);
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Minimum transfer amount is 0.01'
      });
    });

    it('should return error for amount above maximum', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100000,
        transferId: 'trans-1'
      };
      
      const result = validateTransferCommand(command);
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Maximum transfer amount is 50000'
      });
    });

    it('should return error for unsupported currency', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100,
        currency: 'JPY',
        transferId: 'trans-1'
      };
      
      const result = validateTransferCommand(command);
      expect(result).toEqual({
        type: 'InvalidCurrency',
        message: 'Currency JPY is not supported'
      });
    });
  });

  describe('decideTransfer', () => {
    it('should create transfer event when valid command and sufficient funds', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100,
        currency: 'USD',
        transferId: 'trans-1'
      };
      
      const state: TransferState = {
        fromAccount: { exists: true, balance: 500, currency: 'USD' },
        toAccount: { exists: true, balance: 200, currency: 'USD' },
        existingTransferIds: []
      };
      
      const result = decideTransfer(command, state);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.fromAccountId).toBe('acc-1');
        expect(result.event.toAccountId).toBe('acc-2');
        expect(result.event.amount).toBe(100);
        expect(result.event.currency).toBe('USD');
        expect(result.event.transferId).toBe('trans-1');
        expect(result.event.type).toBe('MoneyTransferred');
      }
    });

    it('should use from account currency when command currency not specified', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100,
        transferId: 'trans-1'
      };
      
      const state: TransferState = {
        fromAccount: { exists: true, balance: 500, currency: 'EUR' },
        toAccount: { exists: true, balance: 200, currency: 'EUR' },
        existingTransferIds: []
      };
      
      const result = decideTransfer(command, state);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.currency).toBe('EUR');
      }
    });

    it('should return error when from account not found', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100,
        transferId: 'trans-1'
      };
      
      const state: TransferState = {
        fromAccount: null,
        toAccount: { exists: true, balance: 200, currency: 'USD' },
        existingTransferIds: []
      };
      
      const result = decideTransfer(command, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: 'InsufficientFunds',
          message: 'From account not found'
        });
      }
    });

    it('should return error when to account not found', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100,
        transferId: 'trans-1'
      };
      
      const state: TransferState = {
        fromAccount: { exists: true, balance: 500, currency: 'USD' },
        toAccount: null,
        existingTransferIds: []
      };
      
      const result = decideTransfer(command, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: 'InsufficientFunds',
          message: 'To account not found'
        });
      }
    });

    it('should return error for duplicate transfer ID', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 100,
        transferId: 'trans-1'
      };
      
      const state: TransferState = {
        fromAccount: { exists: true, balance: 500, currency: 'USD' },
        toAccount: { exists: true, balance: 200, currency: 'USD' },
        existingTransferIds: ['trans-1', 'trans-2']
      };
      
      const result = decideTransfer(command, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: 'DuplicateTransfer',
          message: 'Transfer ID already exists'
        });
      }
    });

    it('should return error for insufficient funds', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: 600,
        transferId: 'trans-1'
      };
      
      const state: TransferState = {
        fromAccount: { exists: true, balance: 500, currency: 'USD' },
        toAccount: { exists: true, balance: 200, currency: 'USD' },
        existingTransferIds: []
      };
      
      const result = decideTransfer(command, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: 'InsufficientFunds',
          message: 'Insufficient funds for transfer'
        });
      }
    });

    it('should return error for invalid amount', () => {
      const command: TransferMoneyCommand = {
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        amount: -100,
        transferId: 'trans-1'
      };
      
      const state: TransferState = {
        fromAccount: { exists: true, balance: 500, currency: 'USD' },
        toAccount: { exists: true, balance: 200, currency: 'USD' },
        existingTransferIds: []
      };
      
      const result = decideTransfer(command, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('InvalidAmount');
      }
    });
  });
});