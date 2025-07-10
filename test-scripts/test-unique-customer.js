require('dotenv').config();
const { EventStore } = require('./dist/eventstore');
const OpenBankAccount = require('./dist/features/open-bank-account');

async function testUniqueCustomerName() {
  const eventStore = new EventStore();
  
  try {
    await eventStore.migrate();
    console.log('🏦 Testing Unique Customer Name Validation\n');

    // 1. Create first account with "Alice"
    console.log('1. Creating account for Alice...');
    const firstResult = await OpenBankAccount.execute(eventStore, {
      customerName: 'Alice',
      accountType: 'checking',
      initialDeposit: 500,
      currency: 'USD'
    });
    
    if (firstResult.success) {
      console.log(`✅ First Alice account created: ${firstResult.event.accountId}`);
    } else {
      console.log('❌ Failed to create first Alice account:', firstResult.error.message);
      return;
    }

    // 2. Try to create second account with same name "Alice"
    console.log('\n2. Attempting to create another account for Alice...');
    const secondResult = await OpenBankAccount.execute(eventStore, {
      customerName: 'Alice',
      accountType: 'savings',
      initialDeposit: 300,
      currency: 'EUR'
    });
    
    if (!secondResult.success) {
      console.log(`✅ Correctly rejected duplicate name: ${secondResult.error.message}`);
    } else {
      console.log('❌ Should have failed due to duplicate customer name!');
    }

    // 3. Create account with different name "Bob"
    console.log('\n3. Creating account for Bob...');
    const bobResult = await OpenBankAccount.execute(eventStore, {
      customerName: 'Bob',
      accountType: 'checking',
      initialDeposit: 1000,
      currency: 'USD'
    });
    
    if (bobResult.success) {
      console.log(`✅ Bob's account created successfully: ${bobResult.event.accountId}`);
    } else {
      console.log('❌ Failed to create Bob account:', bobResult.error.message);
    }

    // 4. Test case sensitivity - try "alice" (lowercase)
    console.log('\n4. Testing case sensitivity with "alice" (lowercase)...');
    const caseTestResult = await OpenBankAccount.execute(eventStore, {
      customerName: 'alice',
      accountType: 'savings',
      initialDeposit: 200,
      currency: 'GBP'
    });
    
    if (caseTestResult.success) {
      console.log(`✅ Lowercase "alice" allowed: ${caseTestResult.event.accountId}`);
    } else {
      console.log(`❌ Lowercase "alice" rejected: ${caseTestResult.error.message}`);
    }

    console.log('\n✅ Unique customer name validation test completed!');
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await eventStore.close();
  }
}

testUniqueCustomerName();