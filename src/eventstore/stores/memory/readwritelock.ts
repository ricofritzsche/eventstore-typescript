// rwlock_fifo.ts
export class ReadWriteLockFIFO {
    private readCount = 0;
    private writeCount = 0;
    private queue: Array<{ type: 'read' | 'write'; resolve: () => void }> = [];

    async acquireRead(): Promise<void> {
        return new Promise<void>((resolve) => {
            // Wenn keine Writer aktiv sind und keine anderen in der Queue warten
            if (this.writeCount === 0 && this.queue.length === 0) {
                this.readCount++;
                resolve();
            } else {
                // In die FIFO-Queue einreihen
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
        
        // Wenn keine Reader mehr aktiv sind, Queue abarbeiten
        if (this.readCount === 0) {
            this.processQueue();
        }
    }

    async acquireWrite(): Promise<void> {
        return new Promise<void>((resolve) => {
            // Wenn keine Reader und Writer aktiv sind und Queue leer
            if (this.readCount === 0 && this.writeCount === 0 && this.queue.length === 0) {
                this.writeCount = 1;
                resolve();
            } else {
                // In die FIFO-Queue einreihen
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
            // Writer kann nur starten wenn keine Reader/Writer aktiv
            if (this.readCount === 0 && this.writeCount === 0) {
                this.queue.shift();
                next.resolve();
            }
        } else {
            // Reader: alle aufeinanderfolgenden Reader aus der Queue nehmen
            const readers: Array<() => void> = [];
            
            while (this.queue.length > 0 && 
                   this.queue[0]?.type === 'read' && 
                   this.writeCount === 0) {
                const reader = this.queue.shift()!;
                readers.push(reader.resolve);
            }
            
            // Alle Reader parallel starten
            readers.forEach(resolve => resolve());
        }
    }

    getStatus() {
        return {
            readCount: this.readCount,
            writeCount: this.writeCount,
            queueLength: this.queue.length,
            queueTypes: this.queue.map(item => item.type)
        };
    }
}
