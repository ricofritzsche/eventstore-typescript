export class ReadWriteLock {
    private readCount = 0;
    private writeCount = 0;
    private waitingWriters = 0;
    private readQueue: Array<() => void> = [];
    private writeQueue: Array<() => void> = [];

    async acquireRead(): Promise<void> {
        return new Promise<void>((resolve) => {
            // with no writers active or waiting we can start reading right away
            if (this.writeCount === 0 && this.waitingWriters === 0) {
                this.readCount++;
                resolve();
            } else {
                // otherwise we get in line an wait...
                this.readQueue.push(() => {
                    this.readCount++;
                    resolve();
                });
            }
        });
    }

    releaseRead(): void {
        if (this.readCount <= 0) {
            throw new Error("No read locks to release");
        }
        
        this.readCount--;
        
        // if no readers are waiting then move on to writers
        if (this.readCount === 0) {
            this.processWriteQueue();
        }
    }

    async acquireWrite(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.waitingWriters++;
            
            // if no readers or writers are active we can start writing right away
            if (this.readCount === 0 && this.writeCount === 0) {
                this.waitingWriters--;
                this.writeCount = 1;
                resolve();
            } else {
                // otherwise get in line and wait
                this.writeQueue.push(() => {
                    this.waitingWriters--;
                    this.writeCount = 1;
                    resolve();
                });
            }
        });
    }

    releaseWrite(): void {
        if (this.writeCount !== 1) {
            throw new Error("No write lock to release");
        }
        
        this.writeCount = 0;
        
        // check first if any writers are waiting
        if (!this.processWriteQueue()) {
            // if not then allow readers to become active
            this.processReadQueue();
        }
    }

    private processWriteQueue(): boolean {
        if (this.writeQueue.length > 0 && this.readCount === 0 && this.writeCount === 0) {
            const nextWriter = this.writeQueue.shift()!;
            nextWriter();
            return true;
        }
        return false;
    }

    private processReadQueue(): void {
        // all readers can be active at the same time
        while (this.readQueue.length > 0 && this.writeCount === 0 && this.waitingWriters === 0) {
            const nextReader = this.readQueue.shift()!;
            nextReader();
        }
    }

    // Hilfsmethoden für Debugging
    getStatus() {
        return {
            readCount: this.readCount,
            writeCount: this.writeCount,
            waitingWriters: this.waitingWriters,
            waitingReaders: this.readQueue.length
        };
    }
}
