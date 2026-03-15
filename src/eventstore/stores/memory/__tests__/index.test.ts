import { createFilter, createQuery } from "../../../filter";
import { EventRecord } from "../../../types";
import { MemoryEventStore } from "../index";
import * as fs from 'fs';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('MemoryEventStore', () => {
    let sut:MemoryEventStore;

    beforeEach(() => {
        sut = new MemoryEventStore();
    });


    describe('append and query', () => { 
        it('simple scenario', async () => {
            await sut.append([{
                eventType: 'test1',
                payload: {}
            }, {
                eventType: 'test2',
                payload: {}
            }]);
            let result = await sut.query(createQuery(createFilter(["test2"])));
            expect(result.events.length).toBe(1);
            expect(result.events[0]?.eventType).toBe("test2");
            expect(result.events[0]?.sequenceNumber).toBe(2);

            await sut.append([{
                eventType: 'test3',
                payload: {}
            }, {
                eventType: 'test2',
                payload: {}
            }]);
            result = await sut.query(createQuery(createFilter(["test2"])));
            expect(result.events.length).toBe(2);
            expect(result.events[0]?.eventType).toBe("test2");
            expect(result.events[0]?.sequenceNumber).toBe(2);
            expect(result.events[1]?.eventType).toBe("test2");
            expect(result.events[1]?.sequenceNumber).toBe(4);
        });

        it('conditional append failing', async () => {
            await sut.append([{
                eventType: 'test1',
                payload: { id: 1 }
            }, {
                eventType: 'test2',
                payload: {}
            }]);

            const test1Filter = createQuery(createFilter(["test1"]));
            let resultTest1 = await sut.query(test1Filter);


            await sut.append([{eventType: "test3", payload: {}}], test1Filter, resultTest1.maxSequenceNumber); // no conflict

            await sut.append([{eventType: "test1", payload: { id: 2 }}]); // add another test1 event to provoke a conflict

            // Now a conflict is expected!
            await expect(sut.append([{eventType: "test4", payload: {}}], test1Filter, resultTest1.maxSequenceNumber))
                .rejects.toThrow("eventstore-stores-memory-err05")
        });


        it('query with minSequenceNumber filters by type and sequence', async () => {
            await sut.append([
                { eventType: 'e1', payload: {} },
                { eventType: 'e2', payload: {} },
                { eventType: 'e1', payload: {} },
                { eventType: 'e2', payload: {} },
            ]);

            const result = await sut.query(createQuery({ minSequenceNumber: 2 }, createFilter(['e1', 'e2'])));

            expect(result.events.length).toBe(2);
            expect(result.events[0]?.sequenceNumber).toBe(3);
            expect(result.events[1]?.sequenceNumber).toBe(4);
            expect(result.maxSequenceNumber).toBe(4);
        });

        it('query with minSequenceNumber without type filter returns all events after that point', async () => {
            await sut.append([
                { eventType: 'e1', payload: {} },
                { eventType: 'e2', payload: {} },
                { eventType: 'e3', payload: {} },
            ]);

            const result = await sut.query(createQuery({ minSequenceNumber: 1 }));

            expect(result.events.length).toBe(2);
            expect(result.events[0]?.sequenceNumber).toBe(2);
            expect(result.events[1]?.sequenceNumber).toBe(3);
            expect(result.maxSequenceNumber).toBe(3);
        });

        it('query all events', async () => {
            await sut.append([{
                eventType: 'test1',
                payload: {}
            }, {
                eventType: 'test2',
                payload: {}
            }]);
            let result = await sut.queryAll();
            expect(result.events.length).toBe(2);
            expect(result.events[1]?.eventType).toBe("test2");
            expect(result.events[1]?.sequenceNumber).toBe(2);
        });
    });


    describe('get notified', () => { 
        it('register subscription', async () => {
            let received:EventRecord[] = []
            const sub = await sut.subscribe(async (events) => { received = events;});

            await sut.append([{
                eventType: 'test1',
                payload: {}
            }, {
                eventType: 'test2',
                payload: {}
            }]);

            expect(received.length).toBe(2);
            expect(received[0]?.eventType).toBe("test1");
            expect(received[0]?.sequenceNumber).toBe(1);
            expect(received[1]?.eventType).toBe("test2");
            expect(received[1]?.sequenceNumber).toBe(2);

            await sub.unsubscribe()
        });
    });


    describe("EventStore Locking", () => {
        it("should not block query while notifications are running", async () => {
            await sut.subscribe(async () => {
                await sleep(50);
            });

            const results: string[] = [];

            const appendPromise = sut.append([{ eventType: 'test', payload: {} }])
                .then(() => results.push('append-done'));

            await sleep(5);

            await sut.query()
                .then(() => results.push('query-done'));

            await appendPromise;

            expect(results).toEqual(['query-done', 'append-done']);
        });

        it("should keep notification order across concurrent appends", async () => {
            const notificationOrder: number[][] = [];

            await sut.subscribe(async (events) => {
                if (events[0]?.eventType === 'slow') {
                    await sleep(40);
                }
                notificationOrder.push(events.map((event) => event.sequenceNumber));
            });

            const firstAppend = sut.append([{ eventType: 'slow', payload: {} }]);
            const secondAppend = sut.append([{ eventType: 'fast', payload: {} }]);

            await Promise.all([firstAppend, secondAppend]);

            expect(notificationOrder).toEqual([[1], [2]]);
        });
    }); 


    describe("EventStore persistence", () => {
        it("store and load", async () => {
            try {
                fs.unlinkSync("test.json");
            } catch (err) {}

            await sut.append([{eventType:"e1", payload:{m:"hello"}}, {eventType:"e2", payload:{m:"world"}}])
            
            await sut.storeToFile("test.json");
            const loaded = await MemoryEventStore.createFromFile("test.json");
            
            expect((await loaded.queryAll()).events.length).toBe(2);
            expect((await loaded.queryAll()).events[0]!.eventType).toBe("e1");
            expect((await loaded.queryAll()).events[0]!.payload.m).toBe("hello");
            expect((await loaded.queryAll()).events[0]!.sequenceNumber).toBe(1);
            expect((await loaded.queryAll()).events[1]!.eventType).toBe("e2");
            expect((await loaded.queryAll()).events[1]!.payload.m).toBe("world");
            expect((await loaded.queryAll()).events[1]!.sequenceNumber).toBe(2);
        });

        it("createFromFile(ignoreMissingFile=true) returns empty store when file is missing", async () => {
            const filename = "missing.json";
            try {
                fs.unlinkSync(filename);
            } catch (err) {}

            const loaded = await MemoryEventStore.createFromFile(filename, true);
            expect((await loaded.queryAll()).events.length).toBe(0);
        });

        it("writeThruMode persists automatically on append()", async () => {
            const filename = "write-thru.json";
            try {
                fs.unlinkSync(filename);
            } catch (err) {}

            const store = await MemoryEventStore.createFromFile(filename, true, true);
            await store.append([{ eventType: "e1", payload: { m: "hello" } }]);

            expect(fs.existsSync(filename)).toBe(true);
            const reloaded = await MemoryEventStore.createFromFile(filename);
            expect((await reloaded.queryAll()).events.length).toBe(1);
            expect((await reloaded.queryAll()).events[0]!.eventType).toBe("e1");
            expect((await reloaded.queryAll()).events[0]!.payload.m).toBe("hello");
        });
    })

}); 
