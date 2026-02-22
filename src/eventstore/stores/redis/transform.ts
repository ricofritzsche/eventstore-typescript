import { EventRecord, Event } from '../../types';

/**
 * Redis Stream entry structure returned by XRANGE/XREVRANGE in node-redis v5
 * Returns tuples: [string, string[]] where:
 * - First element is the stream ID (format "timestamp-sequence")
 * - Second element is a flat array of field-value pairs: ["field1", "value1", "field2", "value2", ...]
 */
export type StreamEntry = [string, string[]];

/**
 * Event document extracted from Redis Stream entry
 */
export interface EventDocument {
  streamId: string;
  sequence_number: number;
  occurred_at: string; // ISO date string
  event_type: string;
  payload: Record<string, unknown>;
}

/**
 * Converts a Redis Stream entry tuple to an EventDocument
 * Parses the tuple format: [streamId, [field1, value1, field2, value2, ...]]
 */
export function streamEntryToEventDocument(entry: StreamEntry): EventDocument {
  const [streamId, fieldValuePairs] = entry;
  
  // Convert flat array of field-value pairs to object
  // Array format: ["field1", "value1", "field2", "value2", ...]
  const message: Record<string, string> = {};
  for (let i = 0; i < fieldValuePairs.length; i += 2) {
    const field = fieldValuePairs[i];
    const value = fieldValuePairs[i + 1];
    if (field !== undefined && value !== undefined) {
      message[field] = value;
    }
  }
  
  return {
    streamId,
    sequence_number: parseInt(message.sequence_number || '0', 10),
    occurred_at: message.occurred_at || new Date().toISOString(),
    event_type: message.event_type || '',
    payload: message.payload ? JSON.parse(message.payload) : {},
  };
}

/**
 * Converts a Redis-stored event document to an EventRecord
 */
export function deserializeEvent(doc: EventDocument): EventRecord {
  return {
    sequenceNumber: doc.sequence_number,
    timestamp: new Date(doc.occurred_at),
    eventType: doc.event_type,
    payload: doc.payload,
  };
}

/**
 * Converts Redis Stream entries to EventRecord array
 */
export function mapStreamEntriesToEvents(entries: StreamEntry[]): EventRecord[] {
  const docs = entries.map(streamEntryToEventDocument);
  return docs.map((doc) => deserializeEvent(doc));
}

/**
 * Converts EventDocuments to EventRecord array (for backward compatibility)
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
 * Prepares events for Redis Stream storage as field-value pairs for XADD
 * Returns an object with field-value pairs (all values must be strings)
 */
export function prepareEventForStreamStorage(
  event: Event,
  sequenceNumber: number,
  occurredAt: Date
): Record<string, string> {
  return {
    sequence_number: sequenceNumber.toString(),
    occurred_at: occurredAt.toISOString(),
    event_type: event.eventType,
    payload: JSON.stringify(event.payload),
  };
}

/**
 * Prepares events for Redis storage (legacy function for backward compatibility)
 */
export function prepareEventForStorage(event: Event, sequenceNumber: number, occurredAt: Date): EventDocument {
  return {
    streamId: '', // Not used in legacy mode
    sequence_number: sequenceNumber,
    occurred_at: occurredAt.toISOString(),
    event_type: event.eventType,
    payload: event.payload,
  };
}

