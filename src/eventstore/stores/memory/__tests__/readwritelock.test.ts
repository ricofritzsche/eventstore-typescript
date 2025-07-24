// rwlock.test.ts
import { ReadWriteLock } from "../readwritelock";


describe("ReadWriteLock", () => {
    let lock: ReadWriteLock;

    beforeEach(() => {
        lock = new ReadWriteLock();
    });

    describe("Read operations", () => {
        it("should allow single read lock", async () => {
            await lock.acquireRead();
            const status = lock.getStatus();
            
            expect(status.readCount).toBe(1);
            expect(status.writeCount).toBe(0);
            
            lock.releaseRead();
            
            const finalStatus = lock.getStatus();
            expect(finalStatus.readCount).toBe(0);
        });

        it("should allow multiple concurrent reads", async () => {
            const results: string[] = [];
            
            const reader1 = async () => {
                await lock.acquireRead();
                results.push("reader1 acquired");
                await new Promise(resolve => setTimeout(resolve, 50));
                results.push("reader1 releasing");
                lock.releaseRead();
            };
            
            const reader2 = async () => {
                await lock.acquireRead();
                results.push("reader2 acquired");
                await new Promise(resolve => setTimeout(resolve, 30));
                results.push("reader2 releasing");
                lock.releaseRead();
            };
            
            await Promise.all([reader1(), reader2()]);
            
            expect(results).toEqual([
                "reader1 acquired",
                "reader2 acquired",
                "reader2 releasing",
                "reader1 releasing"
            ]);
        });

        it("should throw error when releasing read lock without acquiring", () => {
            expect(() => lock.releaseRead()).toThrow("No read locks to release");
        });
    });

    describe("Write operations", () => {
        it("should allow single write lock", async () => {
            await lock.acquireWrite();
            const status = lock.getStatus();
            
            expect(status.readCount).toBe(0);
            expect(status.writeCount).toBe(1);
            
            lock.releaseWrite();
            
            const finalStatus = lock.getStatus();
            expect(finalStatus.writeCount).toBe(0);
        });

        it("should throw error when releasing write lock without acquiring", () => {
            expect(() => lock.releaseWrite()).toThrow("No write lock to release");
        });

        it("should only allow one writer at a time", async () => {
            const results: string[] = [];
            
            const writer1 = async () => {
                await lock.acquireWrite();
                results.push("writer1 acquired");
                await new Promise(resolve => setTimeout(resolve, 100));
                results.push("writer1 releasing");
                lock.releaseWrite();
            };
            
            const writer2 = async () => {
                await new Promise(resolve => setTimeout(resolve, 20));
                await lock.acquireWrite();
                results.push("writer2 acquired");
                await new Promise(resolve => setTimeout(resolve, 50));
                results.push("writer2 releasing");
                lock.releaseWrite();
            };
            
            await Promise.all([writer1(), writer2()]);
            
            expect(results).toEqual([
                "writer1 acquired",
                "writer1 releasing",
                "writer2 acquired",
                "writer2 releasing"
            ]);
        });
    });

    describe("Read-Write interaction", () => {
        it("should block reads when writer is active", async () => {
            const results: string[] = [];
            
            const writer = async () => {
                await lock.acquireWrite();
                results.push("writer acquired");
                await new Promise(resolve => setTimeout(resolve, 100));
                results.push("writer releasing");
                lock.releaseWrite();
            };
            
            const reader = async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                await lock.acquireRead();
                results.push("reader acquired");
                lock.releaseRead();
            };
            
            await Promise.all([writer(), reader()]);
            
            expect(results).toEqual([
                "writer acquired",
                "writer releasing",
                "reader acquired"
            ]);
        });

        it("should block writes when readers are active", async () => {
            const results: string[] = [];
            
            const reader = async () => {
                await lock.acquireRead();
                results.push("reader acquired");
                await new Promise(resolve => setTimeout(resolve, 100));
                results.push("reader releasing");
                lock.releaseRead();
            };
            
            const writer = async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                await lock.acquireWrite();
                results.push("writer acquired");
                lock.releaseWrite();
            };
            
            await Promise.all([reader(), writer()]);
            
            expect(results).toEqual([
                "reader acquired",
                "reader releasing",
                "writer acquired"
            ]);
        });

        it("should prioritize writers over readers", async () => {
            const results: string[] = [];
            
            // Start with a reader
            await lock.acquireRead();
            results.push("initial reader acquired");
            
            // Queue up a writer and another reader
            const writer = async () => {
                await lock.acquireWrite();
                results.push("writer acquired");
                await new Promise(resolve => setTimeout(resolve, 50));
                lock.releaseWrite();
                results.push("writer released");
            };
            
            const reader = async () => {
                await lock.acquireRead();
                results.push("queued reader acquired");
                lock.releaseRead();
            };
            
            // Start both operations
            const writerPromise = writer();
            const readerPromise = reader();
            
            // Wait a bit, then release the initial reader
            await new Promise(resolve => setTimeout(resolve, 50));
            lock.releaseRead();
            results.push("initial reader released");
            
            await Promise.all([writerPromise, readerPromise]);
            
            expect(results).toEqual([
                "initial reader acquired",
                "initial reader released",
                "writer acquired",
                "writer released",
                "queued reader acquired"
            ]);
        });
    });



describe("Complex scenarios", () => {
    it("should handle multiple readers and writers with correct priority", async () => {
        const results: string[] = [];
        
        // Start with a writer that blocks everything
        await lock.acquireWrite();
        results.push("initial writer acquired");
        
        // Queue readers FIRST (before any writer is queued)
        const reader1Promise = lock.acquireRead();
        const reader2Promise = lock.acquireRead(); 
        const reader3Promise = lock.acquireRead();
        
        // Wait a moment to ensure readers are queued first
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Now queue the second writer (this should wait until after readers)
        const secondWriterPromise = lock.acquireWrite();
        
        // Wait another moment to ensure writer is queued
        await new Promise(resolve => setTimeout(resolve, 10));
        
        // Now release the initial writer to start the queue processing
        lock.releaseWrite();
        results.push("initial writer released");
        
        // Start the actual work operations once locks are acquired
        const operations = [
            reader1Promise.then(async () => {
                results.push("reader1 acquired");
                await new Promise(resolve => setTimeout(resolve, 30));
                lock.releaseRead();
                results.push("reader1 released");
            }),
            reader2Promise.then(async () => {
                results.push("reader2 acquired");
                await new Promise(resolve => setTimeout(resolve, 40));
                lock.releaseRead();
                results.push("reader2 released");
            }),
            reader3Promise.then(async () => {
                results.push("reader3 acquired");
                await new Promise(resolve => setTimeout(resolve, 20));
                lock.releaseRead();
                results.push("reader3 released");
            }),
            secondWriterPromise.then(async () => {
                results.push("second writer acquired");
                await new Promise(resolve => setTimeout(resolve, 50));
                lock.releaseWrite();
                results.push("second writer released");
            })
        ];
        
        await Promise.all(operations);
        
        console.log("Results:", results);
        
        // Verify basic presence of all operations
        expect(results).toContain("initial writer acquired");
        expect(results).toContain("initial writer released");
        expect(results).toContain("reader1 acquired");
        expect(results).toContain("reader2 acquired");
        expect(results).toContain("reader3 acquired");
        expect(results).toContain("second writer acquired");
        expect(results).toContain("second writer released");
        
        // Since readers were queued BEFORE the second writer,
        // they should all acquire before the second writer
        const reader1AcquiredIndex = results.indexOf("reader1 acquired");
        const reader2AcquiredIndex = results.indexOf("reader2 acquired");
        const reader3AcquiredIndex = results.indexOf("reader3 acquired");
        const secondWriterAcquiredIndex = results.indexOf("second writer acquired");
        
        expect(reader1AcquiredIndex).toBeLessThan(secondWriterAcquiredIndex);
        expect(reader2AcquiredIndex).toBeLessThan(secondWriterAcquiredIndex);
        expect(reader3AcquiredIndex).toBeLessThan(secondWriterAcquiredIndex);
        
        // All readers should complete before second writer starts
        const reader1ReleasedIndex = results.indexOf("reader1 released");
        const reader2ReleasedIndex = results.indexOf("reader2 released");  
        const reader3ReleasedIndex = results.indexOf("reader3 released");
        
        expect(reader1ReleasedIndex).toBeLessThan(secondWriterAcquiredIndex);
        expect(reader2ReleasedIndex).toBeLessThan(secondWriterAcquiredIndex);
        expect(reader3ReleasedIndex).toBeLessThan(secondWriterAcquiredIndex);
    });

    it("should demonstrate writer priority blocks new readers", async () => {
        const results: string[] = [];
        
        // Start with a reader
        await lock.acquireRead();
        results.push("initial reader acquired");
        
        // Queue a writer (this will wait and block new readers)
        const writerPromise = lock.acquireWrite();
        
        // Wait a moment, then try to queue another reader
        // This reader should be blocked by the waiting writer
        await new Promise(resolve => setTimeout(resolve, 10));
        const blockedReaderPromise = lock.acquireRead();
        
        const writerOp = writerPromise.then(async () => {
            results.push("writer acquired");
            await new Promise(resolve => setTimeout(resolve, 30));
            lock.releaseWrite();
            results.push("writer released");
        });
        
        const blockedReaderOp = blockedReaderPromise.then(async () => {
            results.push("blocked reader acquired");
            lock.releaseRead();
            results.push("blocked reader released");
        });
        
        // Wait a bit, then release initial reader
        await new Promise(resolve => setTimeout(resolve, 20));
        lock.releaseRead();
        results.push("initial reader released");
        
        await Promise.all([writerOp, blockedReaderOp]);
        
        console.log("Writer priority results:", results);
        
        // Writer should acquire before the blocked reader due to priority
        const writerAcquiredIndex = results.indexOf("writer acquired");
        const blockedReaderAcquiredIndex = results.indexOf("blocked reader acquired");
        
        expect(writerAcquiredIndex).toBeLessThan(blockedReaderAcquiredIndex);
        
        // The blocked reader should only acquire after writer is completely done
        const writerReleasedIndex = results.indexOf("writer released");
        expect(blockedReaderAcquiredIndex).toBeGreaterThan(writerReleasedIndex);
    });

    it("should process queues in correct order (FIFO within same type)", async () => {
        const results: string[] = [];
        
        // Start with a writer to block everything
        await lock.acquireWrite();
        results.push("blocking writer acquired");
        
        // Queue multiple readers first
        const reader1Promise = lock.acquireRead();
        const reader2Promise = lock.acquireRead();
        
        // Then queue multiple writers
        const writer1Promise = lock.acquireWrite();
        const writer2Promise = lock.acquireWrite();
        
        // Set up operations
        const operations = [
            reader1Promise.then(async () => {
                results.push("reader1 acquired");
                await new Promise(resolve => setTimeout(resolve, 20));
                lock.releaseRead();
                results.push("reader1 released");
            }),
            reader2Promise.then(async () => {
                results.push("reader2 acquired");
                await new Promise(resolve => setTimeout(resolve, 20));
                lock.releaseRead();
                results.push("reader2 released");
            }),
            writer1Promise.then(async () => {
                results.push("writer1 acquired");
                await new Promise(resolve => setTimeout(resolve, 30));
                lock.releaseWrite();
                results.push("writer1 released");
            }),
            writer2Promise.then(async () => {
                results.push("writer2 acquired");
                await new Promise(resolve => setTimeout(resolve, 30));
                lock.releaseWrite();
                results.push("writer2 released");
            })
        ];
        
        // Release blocking writer
        await new Promise(resolve => setTimeout(resolve, 10));
        lock.releaseWrite();
        results.push("blocking writer released");
        
        await Promise.all(operations);
        
        console.log("Queue order results:", results);
        
        // Readers should process first (they were queued before writers)
        const reader1Index = results.indexOf("reader1 acquired");
        const reader2Index = results.indexOf("reader2 acquired");
        const writer1Index = results.indexOf("writer1 acquired");
        const writer2Index = results.indexOf("writer2 acquired");
        
        expect(reader1Index).toBeLessThan(writer1Index);
        expect(reader2Index).toBeLessThan(writer1Index);
        
        // Writers should process in order
        expect(writer1Index).toBeLessThan(writer2Index);
    });
});

    


    describe("Error handling", () => {
        it("should handle multiple release attempts gracefully", async () => {
            await lock.acquireRead();
            lock.releaseRead();
            
            expect(() => lock.releaseRead()).toThrow("No read locks to release");
        });

        it("should handle write release without acquire", () => {
            expect(() => lock.releaseWrite()).toThrow("No write lock to release");
        });

        it("should handle double write release", async () => {
            await lock.acquireWrite();
            lock.releaseWrite();
            
            expect(() => lock.releaseWrite()).toThrow("No write lock to release");
        });
    });
});
