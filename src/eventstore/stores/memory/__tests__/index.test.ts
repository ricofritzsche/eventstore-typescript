import { createFilter } from "../../../filter";
import { EventRecord } from "../../../types";
import { MemoryEventStore } from "../index";

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
            let result = await sut.query(createFilter(["test2"]));
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
            result = await sut.query(createFilter(["test2"]));
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

            const test1Filter = createFilter(["test1"]);
            let resultTest1 = await sut.query(test1Filter);


            await sut.append([{eventType: "test3", payload: {}}], test1Filter, resultTest1.maxSequenceNumber); // no conflict

            await sut.append([{eventType: "test1", payload: { id: 2 }}]); // add another test1 event to provoke a conflict

            // Now a conflict is expected!
            await expect(sut.append([{eventType: "test4", payload: {}}], test1Filter, resultTest1.maxSequenceNumber))
                .rejects.toThrow("eventstore-stores-memory-err05")
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
        it("should block query while append is running", async () => {
            const results: string[] = [];

            // Start append operation
            const appendPromise = sut.append([{ eventType: 'test', payload: {} }])
                .then(() => results.push('append-done'));

            // Start query immediately after (should be blocked)
            const queryPromise = sut.query()
                .then(() => results.push('query-done'));

            await Promise.all([appendPromise, queryPromise]);

            // Append should complete before query
            expect(results).toEqual(['append-done', 'query-done']);
        });
    }); 

});