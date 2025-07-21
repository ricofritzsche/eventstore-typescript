#!/usr/bin/env node

import dotenv from 'dotenv';
import { PostgresEventStore, createFilter } from './src/eventstore';

// Load environment variables
dotenv.config();

async function runSimpleTest() {
  console.log('🚀 Starting EventStore Simple Test...');
  
  // Create event store with default MemoryEventStreamNotifier
  const eventStore = new PostgresEventStore();
  
  try {
    // Initialize database
    await eventStore.initializeDatabase();
    console.log('✅ Database initialized');
    
    // Subscribe to events (real-time processing)
    const subscription = await eventStore.subscribe(async (events) => {
      console.log('📥 Received events via subscription:');
      for (const event of events) {
        console.log(`  - ${event.eventType}:`, event.payload);
        console.log(`  - Sequence: ${event.sequenceNumber}, Time: ${event.timestamp}`);
      }
    });
    console.log('✅ Event subscription created');
    
    // Store some test events
    console.log('\n💾 Appending events...');
    
    const events = [
      {
        eventType: 'UserRegistered',
        payload: { userId: '123', email: 'alice@example.com', name: 'Alice' }
      },
      {
        eventType: 'UserRegistered', 
        payload: { userId: '456', email: 'bob@example.com', name: 'Bob' }
      },
      {
        eventType: 'UserUpdated',
        payload: { userId: '123', name: 'Alice Smith' }
      }
    ];
    
    for (const event of events) {
      await eventStore.append([event]);
      console.log(`✅ Appended: ${event.eventType}`);
      
      // Give a small delay to see the subscription working
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Query events
    console.log('\n🔍 Querying events...');
    
    // Get all UserRegistered events
    const userRegisteredFilter = createFilter(['UserRegistered']);
    const userResult = await eventStore.query(userRegisteredFilter);
    console.log(`📋 Found ${userResult.events.length} UserRegistered events:`);
    userResult.events.forEach((event, i) => {
      console.log(`  ${i + 1}. ${event.payload.name} (${event.payload.email})`);
    });
    
    // Get events for specific user
    const specificUserFilter = createFilter(['UserRegistered', 'UserUpdated'], [{ userId: '123' }]);
    const specificResult = await eventStore.query(specificUserFilter);
    console.log(`\n📋 Found ${specificResult.events.length} events for user 123:`);
    specificResult.events.forEach((event, i) => {
      console.log(`  ${i + 1}. ${event.eventType}: ${JSON.stringify(event.payload)}`);
    });
    
    // Get all events
    const allEventsFilter = createFilter(['UserRegistered', 'UserUpdated']);
    const allResult = await eventStore.query(allEventsFilter);
    console.log(`\n📋 Total events in store: ${allResult.events.length}`);
    console.log(`📊 Max sequence number: ${allResult.maxSequenceNumber}`);
    
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await subscription.unsubscribe();
    console.log('✅ Subscription cleaned up');
    
    await eventStore.close();
    console.log('✅ EventStore closed');
    
    console.log('\n🎉 Simple test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
runSimpleTest().catch(console.error);