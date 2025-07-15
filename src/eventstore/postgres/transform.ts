import { QueryResult } from 'pg';
import { PostgresEventRecord } from './types';
import { EventRecord, Event } from '../types';


export function deserializeEvent(row: any): PostgresEventRecord {
  return new PostgresEventRecord(
    row.sequence_number,
    row.occurred_at,
    row.event_type,
    row.event_version,
    typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
    JSON.parse(row.metadata)
  );
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