import { QueryResult } from 'pg';
import { HasEventType } from '../types';

export function deserializeEvent<T extends HasEventType>(row: any): T {
  const payload = typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload;
  return {
    ...payload,
    event_type: row.event_type,
    sequenceNumber: row.sequence_number,
    occurredAt: row.occurred_at
  } as T;
}

export function mapRecordsToEvents<T extends HasEventType>(result: QueryResult<any>): T[] {
  return result.rows.map(row => deserializeEvent<T>(row));
}

export function extractMaxSequenceNumber(result: QueryResult<any>): number {
  const lastRow = result.rows[result.rows.length - 1];
  return lastRow ? parseInt(lastRow.sequence_number, 10) : 0;
}

export function prepareInsertParams<T extends HasEventType>(events: T[], contextParams: unknown[]): unknown[] {
  const eventTypes: string[] = [];
  const payloads: string[] = [];
  const metadata: string[] = [];

  for (const event of events) {
    eventTypes.push(event.eventType());
    payloads.push(JSON.stringify(event));
    metadata.push(JSON.stringify({
      version: event.eventVersion?.() || '1.0'
    }));
  }

  return [
    ...contextParams,
    eventTypes,
    payloads,
    metadata
  ];
}