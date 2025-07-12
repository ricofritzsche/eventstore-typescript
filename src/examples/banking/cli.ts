#!/usr/bin/env node

import * as readline from 'readline';
import dotenv from 'dotenv';
import { PostgresEventStore, IEventStore } from '../../eventstore';
import * as OpenBankAccount from './features/open-bank-account';
import * as GetAccount from './features/get-account';
import * as DepositMoney from './features/deposit-money';
import * as WithdrawMoney from './features/withdraw-money';
import * as TransferMoney from './features/transfer-money';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

class BankingCLI {
  private eventStore: PostgresEventStore;

  constructor() {
    this.eventStore = new PostgresEventStore();
  }

  async start() {
    try {
      await this.eventStore.initializeDatabase();
      console.log('🏦 Welcome to the Event-Sourced Banking System!\n');
      await this.showMainMenu();
    } catch (error) {
      console.error('Failed to initialize:', error);
      await this.eventStore.close();
      rl.close();
      process.exit(1);
    }
  }

  private async showMainMenu() {
    console.log('Choose an option:');
    console.log('1. Open Bank Account');
    console.log('2. Deposit Money');
    console.log('3. Withdraw Money');
    console.log('4. Transfer Money');
    console.log('5. View Account Balance');
    console.log('6. Exit');
    console.log();

    const choice = await this.askQuestion('Enter your choice (1-6): ');
    
    switch (choice) {
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
        await this.eventStore.close();
        rl.close();
        process.exit(0);
      default:
        console.log('Invalid choice. Please try again.\n');
        await this.showMainMenu();
    }
  }

  private async handleOpenAccount() {
    console.log('\n📝 Opening Bank Account');
    
    const customerName = await this.askQuestion('Customer Name: ');
    const accountTypeInput = await this.askQuestion('Account Type (checking/savings, default checking): ');
    const accountType = (accountTypeInput.trim() === '' ? 'checking' : accountTypeInput) as 'checking' | 'savings';
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

  private async continueOrExit() {
    console.log();
    const choice = await this.askQuestion('Continue? (Y/n): ');
    
    if (choice === '' || choice.toLowerCase() === 'y' || choice.toLowerCase() === 'yes') {
      console.log();
      await this.showMainMenu();
    } else {
      console.log('Thank you for using the Banking System!');
      await this.eventStore.close();
      rl.close();
      process.exit(0);
    }
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