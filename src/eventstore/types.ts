/**
 * @fileoverview Core TypeScript interfaces and types for event sourcing
 *
 * This module defines all the fundamental types used throughout the event sourcing library,
 * including event definitions, store interfaces, subscription management, and query structures.
 * These types provide the foundation for building type-safe event-sourced applications.
 **/

export interface Event {
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

export interface EventRecord extends Event {
  readonly sequenceNumber: number;
  readonly timestamp: Date;
}

export interface EventFilter {
  readonly eventTypes: string[]; // OR
  // AND
  readonly payloadPredicates?: Record<string, unknown>[]; // OR
}

export interface EventQuery {
  readonly filters: EventFilter[]; // OR
}

export interface QueryResult {
  events: EventRecord[];
  maxSequenceNumber: number;
}

export interface EventStore {
  query(filterCriteria: EventQuery): Promise<QueryResult>;
  query(filterCriteria: EventFilter): Promise<QueryResult>;

  append(events: Event[]): Promise<void>;
  append(events: Event[], filterCriteria: EventQuery, expectedMaxSequenceNumber: number): Promise<void>;
  append(events: Event[], filterCriteria: EventFilter, expectedMaxSequenceNumber: number): Promise<void>;
  
  subscribe(handle: HandleEvents): Promise<EventSubscription>;
}

// Import types from the event stream for subscription functionality
export type HandleEvents = (events: EventRecord[]) => Promise<void>;

export interface EventSubscription {
  readonly id: string;
  unsubscribe(): Promise<void>;
}

export interface Subscription {
  id: string;
  handle: HandleEvents;
}

export interface EventStreamNotifier {
  subscribe(handle: HandleEvents): Promise<EventSubscription>;
  notify(events: EventRecord[]): Promise<void>;
  close(): Promise<void>;
}
