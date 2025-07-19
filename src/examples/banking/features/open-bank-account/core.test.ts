import { foldOpenAccountState, decideOpenAccount, validateOpenAccountCommand } from './core';
import { OpenBankAccountCommand, OpenAccountState } from './types';

describe('open-bank-account core', () => {
  describe('foldOpenAccountState', () => {
    it('should return empty customer names for no events', () => {
      const result = foldOpenAccountState([]);
      expect(result.existingCustomerNames).toEqual([]);
    });

    it('should extract customer names from BankAccountOpened events', () => {
      const events = [
        { eventType: 'BankAccountOpened', payload: { customerName: 'John Doe' } },
        { eventType: 'BankAccountOpened', payload: { customerName: 'Jane Smith' } },
        { eventType: 'MoneyDeposited', payload: { customerName: 'Not Relevant' } }
      ];
      
      const result = foldOpenAccountState(events);
      expect(result.existingCustomerNames).toEqual(['John Doe', 'Jane Smith']);
    });
  });

  describe('validateOpenAccountCommand', () => {
    it('should return null for valid command', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'checking',
        initialDeposit: 100,
        currency: 'USD'
      };
      
      const result = validateOpenAccountCommand(command);
      expect(result).toBeNull();
    });

    it('should return error for empty customer name', () => {
      const command: OpenBankAccountCommand = {
        customerName: '',
        accountType: 'checking'
      };
      
      const result = validateOpenAccountCommand(command);
      expect(result).toEqual({
        type: 'InvalidCustomerName',
        message: 'Customer name is required'
      });
    });

    it('should return error for short customer name', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'A',
        accountType: 'checking'
      };
      
      const result = validateOpenAccountCommand(command);
      expect(result).toEqual({
        type: 'InvalidCustomerName',
        message: 'Customer name must be at least 2 characters'
      });
    });

    it('should return error for invalid account type', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'invalid'
      };
      
      const result = validateOpenAccountCommand(command);
      expect(result).toEqual({
        type: 'InvalidAccountType',
        message: 'Account type must be one of: checking, savings'
      });
    });

    it('should return error for negative initial deposit', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'checking',
        initialDeposit: -100
      };
      
      const result = validateOpenAccountCommand(command);
      expect(result).toEqual({
        type: 'InvalidInitialDeposit',
        message: 'Initial deposit cannot be negative'
      });
    });

    it('should return error for excessive initial deposit', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'checking',
        initialDeposit: 2000000
      };
      
      const result = validateOpenAccountCommand(command);
      expect(result).toEqual({
        type: 'InvalidInitialDeposit',
        message: 'Initial deposit cannot exceed 1000000'
      });
    });

    it('should return error for unsupported currency', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'checking',
        currency: 'JPY'
      };
      
      const result = validateOpenAccountCommand(command);
      expect(result).toEqual({
        type: 'InvalidCurrency',
        message: 'Currency JPY is not supported'
      });
    });
  });

  describe('decideOpenAccount', () => {
    const accountId = 'test-account-id';

    it('should create account when valid command and no existing customer', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'checking',
        initialDeposit: 100,
        currency: 'USD'
      };
      
      const state: OpenAccountState = {
        existingCustomerNames: []
      };
      
      const result = decideOpenAccount(command, accountId, state);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.accountId).toBe(accountId);
        expect(result.event.customerName).toBe('John Doe');
        expect(result.event.accountType).toBe('checking');
        expect(result.event.initialDeposit).toBe(100);
        expect(result.event.currency).toBe('USD');
      }
    });

    it('should use defaults for optional fields', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe'
      };
      
      const state: OpenAccountState = {
        existingCustomerNames: []
      };
      
      const result = decideOpenAccount(command, accountId, state);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.event.accountType).toBe('checking');
        expect(result.event.initialDeposit).toBe(0);
        expect(result.event.currency).toBe('USD');
      }
    });

    it('should return error for duplicate customer name', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'checking'
      };
      
      const state: OpenAccountState = {
        existingCustomerNames: ['John Doe', 'Jane Smith']
      };
      
      const result = decideOpenAccount(command, accountId, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toEqual({
          type: 'InvalidCustomerName',
          message: 'Customer name already exists'
        });
      }
    });

    it('should trim customer name and check for duplicates', () => {
      const command: OpenBankAccountCommand = {
        customerName: '  John Doe  ',
        accountType: 'checking'
      };
      
      const state: OpenAccountState = {
        existingCustomerNames: ['John Doe']
      };
      
      const result = decideOpenAccount(command, accountId, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('InvalidCustomerName');
      }
    });

    it('should return error for invalid account type', () => {
      const command: OpenBankAccountCommand = {
        customerName: 'John Doe',
        accountType: 'invalid'
      };
      
      const state: OpenAccountState = {
        existingCustomerNames: []
      };
      
      const result = decideOpenAccount(command, accountId, state);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe('InvalidAccountType');
      }
    });
  });
});