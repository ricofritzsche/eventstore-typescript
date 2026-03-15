import { EventRecord } from '../../types';

function toSequenceNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || !Number.isSafeInteger(parsed)) {
    throw new Error('eventstore-stores-supabase-err09: sequence_number is not a safe integer');
  }
  return parsed;
}

function toTimestamp(value: unknown): Date {
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('eventstore-stores-supabase-err10: occurred_at is not a valid timestamp');
  }
  return parsed;
}

export function deserializeEvent(row: Record<string, unknown>): EventRecord {
  const eventType = row.event_type;
  if (typeof eventType !== 'string' || eventType.length === 0) {
    throw new Error('eventstore-stores-supabase-err11: event_type is missing or invalid');
  }

  const payload = row.payload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('eventstore-stores-supabase-err12: payload is missing or invalid');
  }

  return {
    sequenceNumber: toSequenceNumber(row.sequence_number),
    timestamp: toTimestamp(row.occurred_at),
    eventType,
    payload: payload as Record<string, unknown>,
  };
}

