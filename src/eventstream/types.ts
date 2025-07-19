import { Event } from '../eventstore/types';

export type HandleEvents = (events: Event[]) => Promise<void>;

export interface EventSubscription {
  readonly id: string;
  unsubscribe(): Promise<void>;
}

export interface EventStream {
  subscribe(handle: HandleEvents): Promise<EventSubscription>;
  dispatch(events: Event[]): Promise<void>;
  close(): Promise<void>;
}