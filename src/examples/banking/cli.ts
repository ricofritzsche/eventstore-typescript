#!/usr/bin/env node

import * as readline from 'readline';
import * as dotenv from 'dotenv';
import { PostgresEventStore } from '../../postgres';
import * as OpenBankAccount from './features/open-bank-account';
import * as GetAccount from './features/get-account';
import * as DepositMoney from './features/deposit-money';
import * as WithdrawMoney from './features/withdraw-money';
import * as TransferMoney from './features/transfer-money';
import * as ListAccounts from './features/list-accounts';
import * as Analytics from './features/analytics';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class BankingCLI {
  private readonly eventStore: PostgresEventStore;
  private stopAccountsListener: (() => Promise<void>) | null = null;
  private stopAnalyticsListener: (() => Promise<void>) | null = null;

  constructor() {
    this.eventStore = new PostgresEventStore();
  }

  async start() {
    try {
      await this.eventStore.initializeDatabase();
      
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) {
        throw new Error('DATABASE_URL environment variable is required');
      }
      
      await ListAccounts.createAccountsTable(connectionString);
      await Analytics.createAnalyticsTable(connectionString);
      
      this.stopAccountsListener = await ListAccounts.startAccountProjectionListener(this.eventStore, connectionString);
      this.stopAnalyticsListener = await Analytics.startAnalyticsListener(this.eventStore, connectionString);
      
      console.log('🏦 Welcome to the Event-Sourced Banking System!\n');
      await this.showMainMenu();
    } catch (error) {
      console.error('Failed to initialize:', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  private async showMainMenu() {
    console.log('Choose an option:');
    console.log('0. List All Accounts');
    console.log('1. Open Bank Account');
    console.log('2. Deposit Money');
    console.log('3. Withdraw Money');
    console.log('4. Transfer Money');
    console.log('5. View Account Balance');
    console.log('6. Exit');
    console.log('7. View Account Analytics');
    console.log('98. Rebuild Analytics Projections');
    console.log('99. Rebuild Account Projections');
    console.log();

    const choice = await this.askQuestion('Enter your choice (0-7, 98, 99): ');
    
    switch (choice) {
      case '0':
        await this.handleListAllAccounts();
        break;
      case '1':
        await this.handleOpenAccount();
        break;
      case '2':
        await this.handleDeposit();
        break;
      case '3':
        await this.handleWithdraw();
        break;
      case '4':
        await this.handleTransfer();
        break;
      case '5':
        await this.handleViewBalance();
        break;
      case '6':
        console.log('Thank you for using the Banking System!');
        await this.cleanup();
        process.exit(0);
      case '7':
        await this.handleViewAnalytics();
        break;
      case '98':
        await this.handleRebuildAnalytics();
        break;
      case '99':
        await this.handleRebuildProjections();
        break;
      default:
        console.log('Invalid choice. Please try again.\n');
        await this.showMainMenu();
    }
  }

  private async handleListAllAccounts() {
    console.log('\n📋 All Accounts');
    
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.log('❌ Database connection not configured');
      await this.continueOrExit();
      return;
    }

    try {
      const result = await ListAccounts.queryHandler(connectionString);
      
      if (result.accounts.length === 0) {
        console.log('No accounts found.');
      } else {
        console.log(`\nFound ${result.totalCount} accounts:\n`);
        
        result.accounts.forEach((account, index) => {
          console.log(`${index + 1}. Account ID: ${account.accountId}`);
          console.log(`   Customer: ${account.customerName}`);
          console.log(`   Type: ${account.accountType}`);
          console.log(`   Balance: ${account.balance.toFixed(2)} ${account.currency}`);
          console.log(`   Opened: ${account.openedAt.toISOString().split('T')[0]}`);
          console.log(`   Last Updated: ${account.lastUpdatedAt.toISOString().split('T')[0]}`);
          console.log('');
        });
      }
    } catch (error) {
      console.log('❌ Error retrieving accounts:', error);
    }

    await this.continueOrExit();
  }

  private async handleRebuildAnalytics() {
    console.log('\n🔄 Rebuild Analytics Projections');
    console.log('⚠️  This will clear all existing analytics data and replay account opening events.');
    
    const confirm = await this.askQuestion('Are you sure you want to proceed? (y/N): ');
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('❌ Analytics rebuild cancelled');
      await this.continueOrExit();
      return;
    }
    
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.log('❌ Database connection not configured');
      await this.continueOrExit();
      return;
    }

    try {
      console.log('🚀 Starting analytics rebuild...');
      await Analytics.rebuildAnalyticsProjections(this.eventStore, connectionString);
    } catch (error) {
      console.log('❌ Error rebuilding analytics:', error);
    }
    
    await this.continueOrExit();
  }

  private async handleRebuildProjections() {
    console.log('\n🔄 Rebuild Account Projections');
    console.log('⚠️  This will clear all existing account data and replay all events.');
    
    const confirm = await this.askQuestion('Are you sure you want to proceed? (y/N): ');
    
    if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
      console.log('❌ Rebuild cancelled');
      await this.continueOrExit();
      return;
    }
    
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.log('❌ Database connection not configured');
      await this.continueOrExit();
      return;
    }

    try {
      console.log('🚀 Starting projection rebuild...');
      await ListAccounts.rebuildAccountProjections(this.eventStore, connectionString);
    } catch (error) {
      console.log('❌ Error rebuilding projections:', error);
    }
    
    await this.continueOrExit();
  }

  private async handleOpenAccount() {
    console.log('\n📝 Opening Bank Account');
    
    const customerName = await this.askQuestion('Customer Name: ');
    const accountTypeInput = await this.askQuestion('Account Type (checking/savings, default checking): ');
    const accountType = accountTypeInput.trim() === '' ? 'checking' : accountTypeInput;
    const initialDepositInput = await this.askQuestion('Initial Deposit (optional, default 0): ');
    const initialDeposit = initialDepositInput.trim() === '' ? undefined : parseFloat(initialDepositInput);
    const currencyInput = await this.askQuestion('Currency (USD/EUR/GBP, default USD): ');
    const currency = currencyInput.trim() === '' ? 'USD' : currencyInput;

    const command: OpenBankAccount.OpenBankAccountCommand = {
      customerName,
      accountType,
      currency
    };
    
    if (initialDeposit !== undefined) {
      command.initialDeposit = initialDeposit;
    }

    const result = await OpenBankAccount.execute(this.eventStore, command);

    if (result.success) {
      console.log('✅ Account opened successfully!');
      console.log(`Account ID: ${result.event.accountId}`);
      console.log(`Customer: ${result.event.customerName}`);
      console.log(`Type: ${result.event.accountType}`);
      console.log(`Initial Balance: ${result.event.initialDeposit} ${result.event.currency}`);
      
    } else {
      console.log('❌ Error:', result.error.message);
    }

    await this.continueOrExit();
  }

  private async handleDeposit() {
    console.log('\n💰 Deposit Money');
    
    const accountId = await this.askQuestion('Account ID: ');
    const amountInput = await this.askQuestion('Amount: ');
    const amount = parseFloat(amountInput);
    
    if (isNaN(amount) || amount <= 0) {
      console.log('❌ Error: Please enter a valid positive amount');
      await this.continueOrExit();
      return;
    }
    
    const depositId = `deposit-${Date.now()}`;

    const result = await DepositMoney.execute(this.eventStore, {
      accountId,
      amount,
      currency: '', // Will use account's currency
      depositId
    });

    if (result.success) {
      console.log('✅ Money deposited successfully!');
      console.log(`Amount: ${result.event.amount} ${result.event.currency}`);
      console.log(`Deposit ID: ${result.event.depositId}`);
      
    } else {
      console.log('❌ Error:', result.error.message);
    }

    await this.continueOrExit();
  }

  private async handleWithdraw() {
    console.log('\n🏧 Withdraw Money');
    
    const accountId = await this.askQuestion('Account ID: ');
    const amountInput = await this.askQuestion('Amount: ');
    const amount = parseFloat(amountInput);
    
    if (isNaN(amount) || amount <= 0) {
      console.log('❌ Error: Please enter a valid positive amount');
      await this.continueOrExit();
      return;
    }
    
    const withdrawalId = `withdrawal-${Date.now()}`;

    const result = await WithdrawMoney.execute(this.eventStore, {
      accountId,
      amount,
      withdrawalId
    });

    if (result.success) {
      console.log('✅ Money withdrawn successfully!');
      console.log(`Amount: ${result.event.amount} ${result.event.currency}`);
      console.log(`Withdrawal ID: ${result.event.withdrawalId}`);
      
    } else {
      console.log('❌ Error:', result.error.message);
    }

    await this.continueOrExit();
  }

  private async handleTransfer() {
    console.log('\n🔄 Transfer Money');
    
    const fromAccountId = await this.askQuestion('From Account ID: ');
    const toAccountId = await this.askQuestion('To Account ID: ');
    const amountInput = await this.askQuestion('Amount: ');
    const amount = parseFloat(amountInput);
    
    if (isNaN(amount) || amount <= 0) {
      console.log('❌ Error: Please enter a valid positive amount');
      await this.continueOrExit();
      return;
    }
    
    const transferId = `transfer-${Date.now()}`;

    const result = await TransferMoney.execute(this.eventStore, {
      fromAccountId,
      toAccountId,
      amount,
      transferId
    });

    if (result.success) {
      console.log('✅ Money transferred successfully!');
      console.log(`From: ${result.event.fromAccountId}`);
      console.log(`To: ${result.event.toAccountId}`);
      console.log(`Amount: ${result.event.amount} ${result.event.currency}`);
      console.log(`Transfer ID: ${result.event.transferId}`);
      
    } else {
      console.log('❌ Error:', result.error.message);
    }

    await this.continueOrExit();
  }

  private async handleViewBalance() {
    console.log('\n📊 View Account Balance');
    
    const accountId = await this.askQuestion('Account ID: ');
    
    const account = await GetAccount.execute(this.eventStore, { accountId });
    
    if (account) {
      console.log('✅ Account Information:');
      console.log(`Account ID: ${account.accountId}`);
      console.log(`Customer: ${account.customerName}`);
      console.log(`Type: ${account.accountType}`);
      console.log(`Balance: ${account.balance} ${account.currency}`);
      console.log(`Opened: ${new Date(account.openedAt).toISOString()}`);
    } else {
      console.log('❌ Account not found');
    }

    await this.continueOrExit();
  }

  private async handleViewAnalytics() {
    console.log('\n📈 Account Opening Analytics');
    
    const monthsInput = await this.askQuestion('How many recent months to show? (default: 12): ');
    const months = monthsInput.trim() === '' ? 12 : parseInt(monthsInput);
    
    if (isNaN(months) || months <= 0) {
      console.log('❌ Error: Please enter a valid positive number');
      await this.continueOrExit();
      return;
    }
    
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      console.log('❌ Database connection not configured');
      await this.continueOrExit();
      return;
    }

    try {
      const result = await Analytics.queryHandler(connectionString, { months });
      
      if (result.monthlyStats.length === 0) {
        console.log('No analytics data found.');
      } else {
        console.log(`\n📊 Account Opening Statistics (Last ${months} months):\n`);
        
        let totalOpenings = 0;
        result.monthlyStats.forEach((stat, index) => {
          console.log(`${index + 1}. ${stat.monthName} ${stat.year}`);
          console.log(`   New Accounts: ${stat.accountOpenings}`);
          console.log(`   Total Accounts: ${stat.totalAccounts}`);
          console.log('');
          totalOpenings += stat.accountOpenings;
        });
        
        console.log(`📊 Summary:`);
        console.log(`   Total New Accounts: ${totalOpenings}`);
        console.log(`   Average per Month: ${(totalOpenings / result.monthlyStats.length).toFixed(1)}`);
      }
    } catch (error) {
      console.log('❌ Error retrieving analytics:', error);
    }

    await this.continueOrExit();
  }

  private async continueOrExit() {
    console.log();
    const choice = await this.askQuestion('Continue? (Y/n): ');
    
    if (choice === '' || choice.toLowerCase() === 'y' || choice.toLowerCase() === 'yes') {
      console.log();
      await this.showMainMenu();
    } else {
      console.log('Thank you for using the Banking System!');
      await this.cleanup();
      process.exit(0);
    }
  }

  private async cleanup() {
    if (this.stopAccountsListener) {
      await this.stopAccountsListener();
    }
    if (this.stopAnalyticsListener) {
      await this.stopAnalyticsListener();
    }
    await this.eventStore.close();
    rl.close();
  }


  private askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
      rl.question(question, (answer) => {
        resolve(answer.trim());
      });
    });
  }
}

if (require.main === module) {
  const cli = new BankingCLI();
  cli.start().catch(console.error);
}