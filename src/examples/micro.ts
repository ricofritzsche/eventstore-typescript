import { GenericEvent, Event, EventRecord, PostgresEventStore, createFilter } from '../eventstore';

import dotenv from 'dotenv';
dotenv.config();

const RUN_ID = new Date().toISOString().replace(/[-:T.Z]/g, '');
console.log("Run ID: " + RUN_ID + "\n")


// Event names are suffixed with RUN_ID so there are no collisions between
// different runs of this example. Usually the event names are fixed.
const SOMETHING_HAPPENED_EVENTNAME = "SomethingHappened_" + RUN_ID;


async function main() {
    const eventstore = new PostgresEventStore({ 
        connectionString: process.env.DATABASE_TEST_URL || 'postgres://postgres:postgres@localhost:5432/eventstore'
    });

    await eventstore.initializeDatabase();

    try{
        // write 2 events:
        await eventstore.append([{eventType: SOMETHING_HAPPENED_EVENTNAME, payload: { who: "Peter Pan"}}]);
        await eventstore.append([{eventType: SOMETHING_HAPPENED_EVENTNAME, payload: { what: "The sun rose", id: '1'}}]);

        // retrieve only 1 event:
        const filter = createFilter([SOMETHING_HAPPENED_EVENTNAME], [{ id: '1'}]);
        const context = await eventstore.query(filter);
        
        console.log("Number of matching events: " + context.events.length)
        console.log("What happened? " + context.events[0]?.payload.what)
    } finally {
        await eventstore.close();
    }
}


main();