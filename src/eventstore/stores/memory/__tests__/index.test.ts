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

    
    describe('concurrent access', () => { 
        it('xxx', async () => {
        });
    });
});