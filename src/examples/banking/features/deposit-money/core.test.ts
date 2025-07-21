import { foldDepositState, decideDeposit, validateDepositCommand } from './core';
import { DepositMoneyCommand, DepositState } from './types';

describe('deposit-money core', () => {
  describe('foldDepositState', () => {
    it('should return null account for no BankAccountOpened event', () => {
      const events = [
        { eventType: 'MoneyDeposited', payload: { accountId: 'acc-1', depositId: 'dep-1' } }
      ];
      
      const result = foldDepositState(events, 'acc-1');
      expect(result.account).toBeNull();
      expect(result.existingDepositIds).toEqual(['dep-1']);
    });

    it('should extract account currency from BankAccountOpened event', () => {
      const events = [
        { eventType: 'BankAccountOpened', payload: { accountId: 'acc-1', currency: 'EUR' } },
        { eventType: 'MoneyDeposited', payload: { accountId: 'acc-1', depositId: 'dep-1' } }
      ];
      
      const result = foldDepositState(events, 'acc-1');
      expect(result.account).toEqual({ currency: 'EUR' });
      expect(result.existingDepositIds).toEqual(['dep-1']);
    });

    it('should filter deposit IDs by account ID', () => {
      const events = [
        { eventType: 'BankAccountOpened', payload: { accountId: 'acc-1', currency: 'USD' } },
        { eventType: 'MoneyDeposited', payload: { accountId: 'acc-1', depositId: 'dep-1' } },
        { eventType: 'MoneyDeposited', payload: { accountId: 'acc-2', depositId: 'dep-2' } },
        { eventType: 'MoneyDeposited', payload: { accountId: 'acc-1', depositId: 'dep-3' } }
      ];
      
      const result = foldDepositState(events, 'acc-1');
      expect(result.existingDepositIds).toEqual(['dep-1', 'dep-3']);
    });

    it('should handle empty events', () => {
      const result = foldDepositState([], 'acc-1');
      expect(result.account).toBeNull();
      expect(result.existingDepositIds).toEqual([]);
    });
  });

  describe('validateDepositCommand', () => {
    it('should return null for valid command', () => {
      const command: DepositMoneyCommand = {
        accountId: 'acc-1',
        amount: 100,
        currency: 'USD',
        depositId: 'dep-1'
      };
      
      const result = validateDepositCommand(command);
      expect(result).toBeNull();
    });

    it('should return error for zero amount', () => {
      const command: DepositMoneyCommand = {
        accountId: 'acc-1',
        amount: 0,
        depositId: 'dep-1'
      };
      
      const result = validateDepositCommand(command);
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Deposit amount must be positive'
      });
    });

    it('should return error for negative amount', () => {
      const command: DepositMoneyCommand = {
        accountId: 'acc-1',
        amount: -50,
        depositId: 'dep-1'
      };
      
      const result = validateDepositCommand(command);
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Deposit amount must be positive'
      });
    });

    it('should return error for amount below minimum', () => {
      const command: DepositMoneyCommand = {
        accountId: 'acc-1',
        amount: 0.005,
        depositId: 'dep-1'
      };
      
      const result = validateDepositCommand(command);
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Minimum deposit amount is 0.01'
      });
    });

    it('should return error for amount above maximum', () => {
      const command: DepositMoneyCommand = {
        accountId: 'acc-1',
        amount: 2000000,
        depositId: 'dep-1'
      };
      
      const result = validateDepositCommand(command);
      expect(result).toEqual({
        type: 'InvalidAmount',
        message: 'Maximum deposit amount is 1000000'
      });
    });

    it('should return error for unsupported currency', () => {
      const command: DepositMoneyCommand = {
        accountId: 'acc-1',
        amount: 100,
        currency: 'JPY',
        depositId: 'dep-1'
      };
      
      const result = validateDepositCommand(command);
      expect(result).toEqual({
        type: 'InvalidCurrency',
        message: 'Currency JPY is not supported'
      });
    });
  });

  describe('decideDeposit', () => {
    it('should create deposit event when valid command and account exists', () => {
      const command: DepositMoneyCommand = {
        accountId: 'acc-1',
        amount: 100,
        currency: 'USD',
        depositId: 'dep-1'
      };
      
      const state: DepositState = {
        account: { currency: 'USD' },
        existingDepositIds: []
      };
      
      const result = decideDeposit(command, state);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.accountId).toBe('acc-1');
        expect(result.event.amount).toBe(100);
        expect(result.event.currency).toBe('USD');
        expect(result.event.depositId).toBe('dep-1');
        expect(result.event.type).toBe('MoneyDeposited');
      }
    });

    it('should use account currency when command currency not specified', () => {
      const command: DepositMoneyCommand = {
        accountId: 'acc-1',
        amount: 100,
        depositId: 'dep-1'
      };
      
      const state: DepositState = {
        account: { currency: 'EUR' },
        existingDepositIds: []
      };
      
      const result = decideDeposit(command, state);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.currency).toBe('EUR');
      }
    });

    it('should return error when account not found', () => {
      const command: DepositMoneyCommand = {
        accountId: 'acc-1',
        amount: 100,
        depositId: 'dep-1'
      };
      
      const state: DepositState = {
        account: null,
        existingDepositIds: []
      };
      
      const result = decideDeposit(command, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: 'InvalidAmount',
          message: 'Account not found'
        });
      }
    });

    it('should return error for duplicate deposit ID', () => {
      const command: DepositMoneyCommand = {
        accountId: 'acc-1',
        amount: 100,
        depositId: 'dep-1'
      };
      
      const state: DepositState = {
        account: { currency: 'USD' },
        existingDepositIds: ['dep-1', 'dep-2']
      };
      
      const result = decideDeposit(command, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: 'DuplicateDeposit',
          message: 'Deposit ID already exists'
        });
      }
    });

    it('should return error for invalid amount', () => {
      const command: DepositMoneyCommand = {
        accountId: 'acc-1',
        amount: -100,
        depositId: 'dep-1'
      };
      
      const state: DepositState = {
        account: { currency: 'USD' },
        existingDepositIds: []
      };
      
      const result = decideDeposit(command, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('InvalidAmount');
      }
    });
  });
});