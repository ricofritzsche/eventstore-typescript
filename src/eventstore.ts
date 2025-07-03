import { IEventStore, EventFilter, HasEventType, EventStoreOptions } from './types';
import { PostgresEventStore } from './postgres';
import { EventFilter as EventFilterClass } from './filter';

export class EventStore {
  private store: IEventStore;

  constructor(options: EventStoreOptions = {}) {
    this.store = new PostgresEventStore(options);
  }

  async queryEvents<T extends HasEventType>(filter: EventFilter): Promise<T[]> {
    return this.store.queryEvents<T>(filter);
  }

  async append<T extends HasEventType>(filter: EventFilter, events: T[]): Promise<void> {
    return this.store.append<T>(filter, events);
  }

  async close(): Promise<void> {
    if (this.store instanceof PostgresEventStore) {
      await this.store.close();
    }
  }

  async migrate(): Promise<void> {
    if (this.store instanceof PostgresEventStore) {
      await this.store.createTables();
    }
  }

  static createFilter(eventTypes: string[]): EventFilterClass {
    return EventFilterClass.new(eventTypes);
  }
}