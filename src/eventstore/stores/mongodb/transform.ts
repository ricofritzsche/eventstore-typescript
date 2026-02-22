import { EventRecord, Event } from '../../types';
import { EventDocument } from './schema';

/**
 * Converts a MongoDB document to an EventRecord
 */
export function deserializeEvent(doc: EventDocument): EventRecord {
  return {
    sequenceNumber: doc.sequence_number,
    timestamp: doc.occurred_at instanceof Date ? doc.occurred_at : new Date(doc.occurred_at),
    eventType: doc.event_type,
    payload: doc.payload,
  };
}

/**
 * Converts MongoDB documents to EventRecord array
 */
export function mapDocumentsToEvents(docs: EventDocument[]): EventRecord[] {
  return docs.map((doc) => deserializeEvent(doc));
}

/**
 * Extracts the maximum sequence number from query results
 */
export function extractMaxSequenceNumber(docs: EventDocument[]): number {
  if (docs.length === 0) {
    return 0;
  }
  
  // Documents should be sorted by sequence_number ascending
  const lastDoc = docs[docs.length - 1];
  return lastDoc?.sequence_number || 0;
}

/**
 * Prepares events for MongoDB insertion
 */
export function prepareEventsForInsert(events: Event[]): Omit<EventDocument, 'sequence_number' | 'occurred_at'>[] {
  return events.map((event) => ({
    event_type: event.eventType,
    payload: event.payload,
  }));
}

