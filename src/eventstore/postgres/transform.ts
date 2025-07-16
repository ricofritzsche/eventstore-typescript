import { QueryResult } from 'pg';
import { EventRecord, Event } from '../types';


export function deserializeEvent(row: any): EventRecord {
  return {
    sequenceNumber: row.sequence_number,
    timestamp: row.occurred_at,
    eventType: row.event_type,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  };
}


export function mapRecordsToEvents(result: QueryResult<any>): EventRecord[] {
  return result.rows.map(row => deserializeEvent(row));
}

export function extractMaxSequenceNumber(result: QueryResult<any>): number {
  const lastRow = result.rows[result.rows.length - 1];
  return lastRow ? parseInt(lastRow.sequence_number, 10) : 0;
}


export function prepareInsertParams(events: Event[], contextParams: unknown[]): unknown[] {
  const eventTypes: string[] = [];
  const eventVersions: string[] = [];
  const payloads: string[] = [];
  const metadata: string[] = [];

  for (const event of events) {
    eventTypes.push(event.eventType);
    payloads.push(JSON.stringify(event.payload));
  }

  return [
    ...contextParams,
    eventTypes,
    payloads,
  ];
}