import { EventFilter } from '../types';
import { buildContextVersionQuery } from './query';

export function buildCteInsertQuery(filter: EventFilter, expectedMaxSeq: number): { sql: string, params: unknown[] } {
  const contextVersionQueryConditions = buildContextVersionQuery(filter);
  
  const contextParamCount = contextVersionQueryConditions.params.length;
  const eventTypesParam = contextParamCount + 1;
  const payloadsParam = contextParamCount + 2;
  const metadataParam = contextParamCount + 3;

  return {
    sql: `
    WITH context AS (
      SELECT MAX(sequence_number) AS max_seq
      FROM events
      WHERE ${contextVersionQueryConditions.sql}
    )
    INSERT INTO events (event_type, payload, metadata)
    SELECT unnest($${eventTypesParam}::text[]), unnest($${payloadsParam}::jsonb[]), unnest($${metadataParam}::jsonb[])
    FROM context
    WHERE COALESCE(max_seq, 0) = ${expectedMaxSeq}
  `,
    params: contextVersionQueryConditions.params
  };
}