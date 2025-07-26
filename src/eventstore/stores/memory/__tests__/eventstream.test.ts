import { EventStream } from "../eventstream"


describe('EventStream', () => {
    let sut:EventStream;

    beforeEach(() => {
        sut = new EventStream();
    });


    describe('append and query', () => { 
        it('no events in fresh event stream', async () => {
            const result = sut.eventRecords;
            expect(result.length).toBe(0);
        });

        it('events appended appear as records', async () => {
            sut.append([{
                eventType: 'test1',
                payload: {}
            }, {
                eventType: 'test2',
                payload: {}
            }])
            const result = sut.eventRecords;
            expect(result.length).toBe(2);
            expect(result[0]?.eventType).toBe('test1');
            expect(result[1]?.eventType).toBe('test2');
        });

        it('appended events have correct sequence numbers', async () => {
            sut.append([{
                eventType: 'test1',
                payload: {}
            }, {
                eventType: 'test2',
                payload: {}
            }])
            const result = sut.eventRecords;
            expect(result.length).toBe(2);
            expect(result[0]?.sequenceNumber).toBe(1);
            expect(result[1]?.sequenceNumber).toBe(2);

            expect(result[1]!.timestamp.getTime()).toBeGreaterThanOrEqual(result[0]!.timestamp.getTime());
        });
    });
});