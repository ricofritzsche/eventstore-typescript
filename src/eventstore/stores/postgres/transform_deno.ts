import { EventRecord, Event } from '../../types.ts';

// Universal query result interface
interface UniversalQueryResult {
  rows: any[];
  rowCount?: number;
}

export function deserializeEvent(row: any): EventRecord {
  return {
    sequenceNumber: row.sequence_number,
    timestamp: row.occurred_at,
    eventType: row.event_type,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
  };
}

export function mapRecordsToEvents(result: UniversalQueryResult): EventRecord[] {
  return result.rows.map(row => deserializeEvent(row));
}

export function extractMaxSequenceNumber(result: UniversalQueryResult): number {
  const lastRow = result.rows[result.rows.length - 1];
  return lastRow ? parseInt(lastRow.sequence_number, 10) : 0;
}

export function prepareInsertParams(events: Event[], contextParams: unknown[]): unknown[] {
  const eventTypes: string[] = [];
  const payloads: string[] = [];
  const timestamps: string[] = [];

  for (const event of events) {
    eventTypes.push(event.eventType);
    payloads.push(JSON.stringify(event.payload));
    timestamps.push(new Date().toISOString());
  }

  return [
    ...contextParams,
    eventTypes,
    payloads,
    timestamps
  ];
}