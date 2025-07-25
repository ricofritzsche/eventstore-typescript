import { EventStore, EventFilter, Event, PostgresEventStore, createFilter } from '../src/eventstore';
import dotenv from 'dotenv';

dotenv.config();


describe('Temporary tests', () => {
  let eventStore: PostgresEventStore;

  beforeEach(async () => {
    const connectionString = process.env.DATABASE_TEST_URL || 'postgres://postgres:postgres@localhost:5432/eventstore_test';
    eventStore = new PostgresEventStore(
      { connectionString: connectionString }
    );
    await eventStore.initializeDatabase();
  });

  afterEach(async () => {
    await eventStore.close();
  });


  it('the test', async () => {
    const filter = createFilter(["gameStarted"], [{gameId: "aff2e9fc-84dd-460f-bcf2-e787caccc5fd"}]);
    const result = await eventStore.query(filter);
    expect(result.events).toHaveLength(1);
  });

});