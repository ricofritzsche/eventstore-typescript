// rwlock.test.ts
import { ReadWriteLockFIFO } from "../readwritelock";


describe("ReadWriteLockFIFO", () => {
    let lock: ReadWriteLockFIFO;

    beforeEach(() => {
        lock = new ReadWriteLockFIFO();
    });

    it("should process operations in FIFO order", async () => {
        const results: string[] = [];
        
        // start with a writer to block everything else
        await lock.acquireWrite();
        results.push("initial writer acquired");
        
        // queue up some readers and writers: R1, W1, R2, R3, W2
        const reader1Promise = lock.acquireRead();
        const writer1Promise = lock.acquireWrite(); 
        const reader2Promise = lock.acquireRead();
        const reader3Promise = lock.acquireRead();
        const writer2Promise = lock.acquireWrite();
        
        const operations = [
            reader1Promise.then(async () => {
                results.push("reader1 acquired");
                await new Promise(resolve => setTimeout(resolve, 30));
                lock.releaseRead();
                results.push("reader1 released");
            }),
            writer1Promise.then(async () => {
                results.push("writer1 acquired");
                await new Promise(resolve => setTimeout(resolve, 40));
                lock.releaseWrite();
                results.push("writer1 released");
            }),
            reader2Promise.then(async () => {
                results.push("reader2 acquired");
                await new Promise(resolve => setTimeout(resolve, 20));
                lock.releaseRead();
                results.push("reader2 released");
            }),
            reader3Promise.then(async () => {
                results.push("reader3 acquired");
                await new Promise(resolve => setTimeout(resolve, 25));
                lock.releaseRead();
                results.push("reader3 released");
            }),
            writer2Promise.then(async () => {
                results.push("writer2 acquired");
                await new Promise(resolve => setTimeout(resolve, 30));
                lock.releaseWrite();
                results.push("writer2 released");
            })
        ];
        
        // free initial writer
        await new Promise(resolve => setTimeout(resolve, 10));
        lock.releaseWrite();
        results.push("initial writer released");
        
        await Promise.all(operations);
        
        console.log("FIFO Results:", results);
        
        // expected execution order: R1 -> W1 -> R2,R3 (parallel) -> W2
        const reader1Index = results.indexOf("reader1 acquired");
        const writer1Index = results.indexOf("writer1 acquired");
        const reader2Index = results.indexOf("reader2 acquired");
        const reader3Index = results.indexOf("reader3 acquired");
        const writer2Index = results.indexOf("writer2 acquired");
        
        expect(reader1Index).toBeLessThan(writer1Index);
        expect(writer1Index).toBeLessThan(reader2Index);
        expect(writer1Index).toBeLessThan(reader3Index);
        expect(reader2Index).toBeLessThan(writer2Index);
        expect(reader3Index).toBeLessThan(writer2Index);
        
        // R2 and R3 should run in parallel
        const reader1ReleasedIndex = results.indexOf("reader1 released");
        expect(reader2Index).toBeGreaterThan(reader1ReleasedIndex);
        expect(reader3Index).toBeGreaterThan(reader1ReleasedIndex);
    });
});
