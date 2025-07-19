#!/usr/bin/env node

// Simple test to verify CLI imports work correctly
const { PostgresEventStore } = require('./dist/eventstore');
const { MemoryEventStream } = require('./dist/eventstream');
const { PostgresAccountProjector, getAccounts, rebuildAccountProjections } = require('./dist/examples/banking/features/get-accounts');

console.log('✅ CLI imports test passed!');
console.log('- PostgresEventStore:', typeof PostgresEventStore);
console.log('- MemoryEventStream:', typeof MemoryEventStream);
console.log('- PostgresAccountProjector:', typeof PostgresAccountProjector);
console.log('- getAccounts function:', typeof getAccounts);
console.log('- rebuildAccountProjections function:', typeof rebuildAccountProjections);

process.exit(0);