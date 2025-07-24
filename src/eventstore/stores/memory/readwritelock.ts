export class ReadWriteLockFIFO {
    private readCount = 0;
    private writeCount = 0;
    private queue: Array<{ type: 'read' | 'write'; resolve: () => void }> = [];

    async acquireRead(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (this.writeCount === 0 && this.queue.length === 0) {
                this.readCount++;
                resolve();
            } else {
                this.queue.push({ type: 'read', resolve: () => {
                    this.readCount++;
                    resolve();
                }});
            }
        });
    }

    releaseRead(): void {
        if (this.readCount <= 0) {
            throw new Error("No read locks to release");
        }
        
        this.readCount--;

        if (this.readCount === 0) {
            this.processQueue();
        }
    }

    async acquireWrite(): Promise<void> {
        return new Promise<void>((resolve) => {
            if (this.readCount === 0 && this.writeCount === 0 && this.queue.length === 0) {
                this.writeCount = 1;
                resolve();
            } else {
                this.queue.push({ type: 'write', resolve: () => {
                    this.writeCount = 1;
                    resolve();
                }});
            }
        });
    }

    releaseWrite(): void {
        if (this.writeCount !== 1) {
            throw new Error("No write lock to release");
        }
        
        this.writeCount = 0;
        this.processQueue();
    }

    private processQueue(): void {
        if (this.queue.length === 0) return;

        const next = this.queue[0];
        
        if (next?.type === 'write') {
            if (this.readCount === 0 && this.writeCount === 0) {
                this.queue.shift();
                next.resolve();
            }
        } else {
            const readers: Array<() => void> = [];
            
            while (this.queue.length > 0 && 
                   this.queue[0]?.type === 'read' && 
                   this.writeCount === 0) {
                const reader = this.queue.shift()!;
                readers.push(reader.resolve);
            }

            readers.forEach(resolve => resolve());
        }
    }
}
