import { processQuery } from "../queryprocessor"
import { EventStream } from "../eventstream";
import { createFilter } from "../../../filter";

describe('Query processing', () => {
    let es:EventStream;

    beforeEach(() => {
        es = new EventStream();
    });


    describe('querying', () => { 
        it('no records, not results', async () => {
            const events = es.eventRecords;
            const filter = createFilter(["test1"])
            
            const result = processQuery(events, filter)

            expect(result.length).toBe(0);
        });

        it('filer by 1 event type', async () => {
            es.append([{
                eventType: 'test1',
                payload: { id: 1 }
            }, {
                eventType: 'test2',
                payload: {}
            }, {
                eventType: 'test3',
                payload: {}
            },{
                eventType: 'test1',
                payload: { id: 2 }
            }])

            const events = es.eventRecords;
            const filter = createFilter(["test1"])
            
            const result = processQuery(events, filter)

            expect(result.length).toBe(2);
            expect(result[0]?.payload.id).toBe(1);
            expect(result[1]?.payload.id).toBe(2);
        });

        it('filer by several event type', async () => {
            es.append([{
                eventType: 'test1',
                payload: { id: 1 }
            }, {
                eventType: 'test2',
                payload: {}
            }, {
                eventType: 'test3',
                payload: { id: 3 }
            },{
                eventType: 'test1',
                payload: { id: 2 }
            }])

            const events = es.eventRecords;
            const filter = createFilter(["test1", "test3"])
            
            const result = processQuery(events, filter)

            expect(result.length).toBe(3);
            
            expect(result[0]?.eventType).toBe("test1");
            expect(result[0]?.payload.id).toBe(1);

            expect(result[1]?.eventType).toBe("test3");
            expect(result[1]?.payload.id).toBe(3);

            expect(result[2]?.eventType).toBe("test1");
            expect(result[2]?.payload.id).toBe(2);
        });

        it('filer by event type and simple payload', async () => {
            es.append([{
                eventType: 'test1',
                payload: { id: 1 }
            }, {
                eventType: 'test2',
                payload: {}
            },{
                eventType: 'test1',
                payload: { id: 2 }
            }])

            const events = es.eventRecords;
            const filter = createFilter(["test1"], [{id: 2}])
            
            const result = processQuery(events, filter)

            expect(result.length).toBe(1);
            
            expect(result[0]?.eventType).toBe("test1");
            expect(result[0]?.payload.id).toBe(2);
        });

        it('filter by event type and nested payload', async () => {
            es.append([{
                eventType: 'test1',
                payload: { id: 1, contact: { address: { zip: "1234" } } }
            }, {
                eventType: 'test2',
                payload: {}
            }, {
                eventType: 'test1',
                payload: { id: 2, contact: { address: { zip: "2777" } } }
            }])

            const events = es.eventRecords;
            const filter = createFilter(["test1"], [{contact: { address: { zip: "2777" } } }])
            
            const result = processQuery(events, filter)

            expect(result.length).toBe(1);
            
            expect(result[0]?.eventType).toBe("test1");
            expect(result[0]?.payload.id).toBe(2);
        });

        it('filter by event type and nested payload with multiple predicates', async () => {
            es.append([{
                eventType: 'test1',
                payload: { id: 1, contact: { address: { zip: "1234" } } }
            }, {
                eventType: 'test2',
                payload: {}
            }, {
                eventType: 'test1',
                payload: { id: 2, contact: { address: { zip: "2777" } } }
            }])

            const events = es.eventRecords;
            const filter = createFilter(["test1"], [{contact: { address: { zip: "2777" } } }, {contact: { address: { zip: "1234" } } }])
            
            const result = processQuery(events, filter)

            expect(result.length).toBe(2);

            expect(result[0]?.eventType).toBe("test1");
            expect(result[0]?.payload.id).toBe(1);

            expect(result[1]?.eventType).toBe("test1");
            expect(result[1]?.payload.id).toBe(2);
        });

        it('filter with multiple event types and nested payload with multiple predicates', async () => {
            es.append([{
                eventType: 'test1',
                payload: { id: 1, contact: { address: { zip: "1234" } } }
            }, {
                eventType: 'test2',
                payload: { id: 99 }
            }, {
                eventType: 'test3',
                payload: { id: 2, contact: { address: { zip: "2777" } } }
            }])

            const events = es.eventRecords;
            const filter = createFilter(["test1", "test3"], [{contact: { address: { zip: "2777" } } }, {contact: { address: { zip: "1234" } } }, { id: 99 }])
            
            const result = processQuery(events, filter)

            expect(result.length).toBe(2);

            expect(result[0]?.eventType).toBe("test1");
            expect(result[0]?.payload.id).toBe(1);

            expect(result[1]?.eventType).toBe("test3");
            expect(result[1]?.payload.id).toBe(2);
        });

    });
});