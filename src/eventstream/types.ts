import { Event, EventFilter } from '../eventstore/types';

export type HandleEvent = (event: Event) => Promise<void>;

export type HandleEvents = (events: Event[]) => Promise<void>;

export interface EventStreamOptions {
  readonly batchSize?: number;
  readonly batchTimeout?: number;
  readonly retryAttempts?: number;
  readonly retryDelay?: number;
}

export interface StreamSubscription {
  readonly id: string;
  readonly filter: EventFilter;
  readonly handle: HandleEvents;
  readonly options: EventStreamOptions;
  unsubscribe(): Promise<void>;
}

export interface EventStream {
  subscribe(filter: EventFilter, handle: HandleEvents, options?: EventStreamOptions): Promise<StreamSubscription>;
  dispatch(events: Event[]): Promise<void>;
  close(): Promise<void>;
}

export interface EventStreamPosition {
  readonly sequenceNumber: number;
  readonly timestamp: Date;
}

export interface StreamCheckpoint {
  readonly subscriptionId: string;
  readonly position: EventStreamPosition;
}

// TODO Rico: Implement
export interface PersistentEventStream extends EventStream {
  subscribeFromPosition(
    filter: EventFilter,
    handle: HandleEvents,
    position: EventStreamPosition,
    options?: EventStreamOptions
  ): Promise<StreamSubscription>;

  getCheckpoint(subscriptionId: string): Promise<StreamCheckpoint | null>;
  setCheckpoint(checkpoint: StreamCheckpoint): Promise<void>;
}