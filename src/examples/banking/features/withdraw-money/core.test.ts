import { foldAccountEvents, foldWithdrawState, decideWithdraw, validateWithdrawCommand } from './core';
import { WithdrawMoneyCommand, WithdrawState, AccountState } from './types';

describe('withdraw-money core', () => {
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

    it('should filter events by account ID', () => {
      const events = [
        { eventType: 'BankAccountOpened', payload: { accountId: 'acc-1', initialDeposit: 1000, currency: 'USD' } },
        { eventType: 'MoneyDeposited', payload: { accountId: 'acc-2', amount: 200, currency: 'USD' } },
        { eventType: 'MoneyDeposited', payload: { accountId: 'acc-1', amount: 100, currency: 'USD' } }
      ];
      
      const result = foldAccountEvents(events, 'acc-1');
      expect(result?.balance).toBe(1100);
    });
  });

  describe('foldWithdrawState', () => {
    it('should combine account state and existing withdrawal IDs', () => {
      const events = [
        { eventType: 'BankAccountOpened', payload: { accountId: 'acc-1', initialDeposit: 1000, currency: 'USD' } },
        { eventType: 'MoneyWithdrawn', payload: { accountId: 'acc-1', withdrawalId: 'wit-1' } },
        { eventType: 'MoneyWithdrawn', payload: { accountId: 'acc-2', withdrawalId: 'wit-2' } },
        { eventType: 'MoneyWithdrawn', payload: { accountId: 'acc-1', withdrawalId: 'wit-3' } }
      ];
      
      const result = foldWithdrawState(events, 'acc-1');
      expect(result.account).toEqual({
        exists: true,
        balance: 1000,
        currency: 'USD'
      });
      expect(result.existingWithdrawalIds).toEqual(['wit-1', 'wit-2', 'wit-3']);
    });

    it('should handle case when account does not exist', () => {
      const events = [
        { eventType: 'MoneyWithdrawn', payload: { withdrawalId: 'wit-1' } }
      ];
      
      const result = foldWithdrawState(events, 'acc-1');
      expect(result.account).toBeNull();
      expect(result.existingWithdrawalIds).toEqual(['wit-1']);
    });
  });

  describe('validateWithdrawCommand', () => {
    it('should return null for valid command', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'acc-1',
        amount: 100,
        currency: 'USD',
        withdrawalId: 'wit-1'
      };
      
      const result = validateWithdrawCommand(command);
      expect(result).toBeNull();
    });

    it('should return error for zero amount', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'acc-1',
        amount: 0,
        withdrawalId: 'wit-1'
      };
      
      const result = validateWithdrawCommand(command);
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Withdrawal amount must be positive'
      });
    });

    it('should return error for amount below minimum', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'acc-1',
        amount: 0.005,
        withdrawalId: 'wit-1'
      };
      
      const result = validateWithdrawCommand(command);
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Minimum withdrawal amount is 0.01'
      });
    });

    it('should return error for amount above maximum', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'acc-1',
        amount: 20000,
        withdrawalId: 'wit-1'
      };
      
      const result = validateWithdrawCommand(command);
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Maximum withdrawal amount is 10000'
      });
    });

    it('should return error for unsupported currency', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'acc-1',
        amount: 100,
        currency: 'JPY',
        withdrawalId: 'wit-1'
      };
      
      const result = validateWithdrawCommand(command);
      expect(result).toEqual({
        type: 'InvalidCurrency',
        message: 'Currency JPY is not supported'
      });
    });
  });

  describe('decideWithdraw', () => {
    it('should create withdrawal event when valid command and sufficient funds', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'acc-1',
        amount: 100,
        currency: 'USD',
        withdrawalId: 'wit-1'
      };
      
      const state: WithdrawState = {
        account: { exists: true, balance: 500, currency: 'USD' },
        existingWithdrawalIds: []
      };
      
      const result = decideWithdraw(command, state);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.accountId).toBe('acc-1');
        expect(result.event.amount).toBe(100);
        expect(result.event.currency).toBe('USD');
        expect(result.event.withdrawalId).toBe('wit-1');
        expect(result.event.type).toBe('MoneyWithdrawn');
      }
    });

    it('should use account currency when command currency not specified', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'acc-1',
        amount: 100,
        withdrawalId: 'wit-1'
      };
      
      const state: WithdrawState = {
        account: { exists: true, balance: 500, currency: 'EUR' },
        existingWithdrawalIds: []
      };
      
      const result = decideWithdraw(command, state);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.currency).toBe('EUR');
      }
    });

    it('should return error when account not found', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'acc-1',
        amount: 100,
        withdrawalId: 'wit-1'
      };
      
      const state: WithdrawState = {
        account: null,
        existingWithdrawalIds: []
      };
      
      const result = decideWithdraw(command, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: 'InsufficientFunds',
          message: 'Account not found'
        });
      }
    });

    it('should return error for duplicate withdrawal ID', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'acc-1',
        amount: 100,
        withdrawalId: 'wit-1'
      };
      
      const state: WithdrawState = {
        account: { exists: true, balance: 500, currency: 'USD' },
        existingWithdrawalIds: ['wit-1', 'wit-2']
      };
      
      const result = decideWithdraw(command, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: 'DuplicateWithdrawal',
          message: 'Withdrawal ID already exists'
        });
      }
    });

    it('should return error for insufficient funds', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'acc-1',
        amount: 600,
        withdrawalId: 'wit-1'
      };
      
      const state: WithdrawState = {
        account: { exists: true, balance: 500, currency: 'USD' },
        existingWithdrawalIds: []
      };
      
      const result = decideWithdraw(command, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: 'InsufficientFunds',
          message: 'Insufficient funds for withdrawal'
        });
      }
    });

    it('should return error for invalid amount', () => {
      const command: WithdrawMoneyCommand = {
        accountId: 'acc-1',
        amount: -100,
        withdrawalId: 'wit-1'
      };
      
      const state: WithdrawState = {
        account: { exists: true, balance: 500, currency: 'USD' },
        existingWithdrawalIds: []
      };
      
      const result = decideWithdraw(command, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('InvalidAmount');
      }
    });
  });
});