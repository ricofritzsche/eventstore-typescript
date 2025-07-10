require('dotenv').config();
const { EventStore } = require('./dist/eventstore');
const OpenBankAccount = require('./dist/features/open-bank-account');
const GetAccount = require('./dist/features/get-account');
const DepositMoney = require('./dist/features/deposit-money');
const WithdrawMoney = require('./dist/features/withdraw-money');
const TransferMoney = require('./dist/features/transfer-money');

async function testAllOperations() {
  const eventStore = new EventStore();
  
  try {
    await eventStore.migrate();
    console.log('🏦 Testing All Banking Operations\n');

    // 1. Create two accounts
    console.log('1. Creating two accounts...');
    const timestamp = Date.now();
    const account1Result = await OpenBankAccount.execute(eventStore, {
      customerName: `Alice_${timestamp}`,
      accountType: 'checking',
      initialDeposit: 500,
      currency: 'EUR'
    });
    
    const account2Result = await OpenBankAccount.execute(eventStore, {
      customerName: `Bob_${timestamp}`,
      accountType: 'savings',
      initialDeposit: 300,
      currency: 'EUR'
    });
    
    if (!account1Result.success || !account2Result.success) {
      console.log('❌ Failed to create accounts');
      return;
    }
    
    const account1Id = account1Result.event.accountId;
    const account2Id = account2Result.event.accountId;
    
    console.log(`✅ Alice_${timestamp}'s account: ${account1Id} (500 EUR)`);
    console.log(`✅ Bob_${timestamp}'s account: ${account2Id} (300 EUR)\n`);

    // 2. Deposit money to Alice's account
    console.log('2. Depositing 200 EUR to Alice\'s account...');
    const depositResult = await DepositMoney.execute(eventStore, {
      accountId: account1Id,
      amount: 200,
      depositId: `deposit-${Date.now()}`
    });
    
    if (depositResult.success) {
      console.log(`✅ Deposit successful: ${depositResult.event.amount} ${depositResult.event.currency}`);
      
      const alice = await GetAccount.execute(eventStore, { accountId: account1Id });
      console.log(`   Alice's new balance: ${alice.balance} ${alice.currency}\n`);
    } else {
      console.log('❌ Deposit failed:', depositResult.error.message);
    }

    // 3. Withdraw money from Alice's account
    console.log('3. Withdrawing 150 EUR from Alice\'s account...');
    const withdrawResult = await WithdrawMoney.execute(eventStore, {
      accountId: account1Id,
      amount: 150,
      withdrawalId: `withdrawal-${Date.now()}`
    });
    
    if (withdrawResult.success) {
      console.log(`✅ Withdrawal successful: ${withdrawResult.event.amount} ${withdrawResult.event.currency}`);
      
      const alice = await GetAccount.execute(eventStore, { accountId: account1Id });
      console.log(`   Alice's new balance: ${alice.balance} ${alice.currency}\n`);
    } else {
      console.log('❌ Withdrawal failed:', withdrawResult.error.message);
    }

    // 4. Transfer money from Alice to Bob
    console.log('4. Transferring 250 EUR from Alice to Bob...');
    const transferResult = await TransferMoney.execute(eventStore, {
      fromAccountId: account1Id,
      toAccountId: account2Id,
      amount: 250,
      transferId: `transfer-${Date.now()}`
    });
    
    if (transferResult.success) {
      console.log(`✅ Transfer successful: ${transferResult.event.amount} ${transferResult.event.currency}`);
      console.log(`   From: ${transferResult.event.fromAccountId}`);
      console.log(`   To: ${transferResult.event.toAccountId}\n`);
      
      const alice = await GetAccount.execute(eventStore, { accountId: account1Id });
      const bob = await GetAccount.execute(eventStore, { accountId: account2Id });
      
      console.log('Final balances:');
      console.log(`   Alice: ${alice.balance} ${alice.currency}`);
      console.log(`   Bob: ${bob.balance} ${bob.currency}\n`);
      
      // Expected: Alice = 500 + 200 - 150 - 250 = 300 EUR
      // Expected: Bob = 300 + 250 = 550 EUR
      console.log('Expected balances:');
      console.log('   Alice: 300 EUR (500 + 200 - 150 - 250)');
      console.log('   Bob: 550 EUR (300 + 250)');
      
      if (alice.balance === 300 && bob.balance === 550) {
        console.log('✅ All operations completed successfully!');
      } else {
        console.log('❌ Balance calculations are incorrect!');
      }
    } else {
      console.log('❌ Transfer failed:', transferResult.error.message);
    }

    // 5. Test insufficient funds
    console.log('\n5. Testing insufficient funds (trying to withdraw 1000 EUR from Alice)...');
    const insufficientResult = await WithdrawMoney.execute(eventStore, {
      accountId: account1Id,
      amount: 1000,
      withdrawalId: `withdrawal-${Date.now() + 1}`
    });
    
    if (!insufficientResult.success) {
      console.log(`✅ Correctly rejected: ${insufficientResult.error.message}`);
    } else {
      console.log('❌ Should have failed due to insufficient funds!');
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await eventStore.close();
  }
}

testAllOperations();