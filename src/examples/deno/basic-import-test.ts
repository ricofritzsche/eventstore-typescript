#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Basic Import Test
 * 
 * Simple test to verify all imports work correctly without requiring a database.
 * This is useful for CI/CD pipelines or quick verification.
 * 
 * Run with: deno run --allow-net --allow-env src/examples/deno/basic-import-test.ts
 */

// @ts-ignore
import { PostgresEventStore, createFilter, Event } from '../../../mod.ts';

async function testImports() {
  console.log('🦕 Testing EventStore imports...');
  
  try {
    // Test that we can create a filter
    console.log('✅ Testing createFilter...');
    const filter = createFilter(['TestEvent']);
    console.log(`   Filter created for event types: [${filter.eventTypes.join(', ')}]`);
    
    // Test that we can create events
    console.log('✅ Testing Event interface...');
    const event: Event = {
      eventType: 'TestEvent',
      payload: { message: 'Hello, Event Sourcing!' }
    };
    console.log(`   Event created: ${event.eventType}`);
    
    // Test that we can instantiate the store (without connecting)
    console.log('✅ Testing PostgresEventStore instantiation...');
    const store = new PostgresEventStore({
      connectionString: 'postgres://test:test@localhost:5432/test'
    });
    console.log('   Store created successfully');
    
    console.log('\n🎉 All imports and basic functionality work correctly!');
    console.log('🏁 To test full database functionality:');
    console.log('   1. Ensure PostgreSQL is running');
    console.log('   2. Set DATABASE_URL environment variable');
    console.log('   3. Run user-registration.ts or order-fulfillment.ts');
    
  } catch (error) {
    // @ts-ignore
    console.error('❌ Import/instantiation error:', error.message);
    // @ts-ignore
    Deno.exit(1);
  }
}

// @ts-ignore
if (import.meta.main) {
  testImports();
}