import { EventFilter } from '../../types.ts';
import { buildContextVersionQuery } from './query.ts';

export function buildCteInsertQuery(filter: EventFilter, expectedMaxSeq: number): { sql: string, params: unknown[] } {
  const contextVersionQueryConditions = buildContextVersionQuery(filter);
  
  const contextParamCount = contextVersionQueryConditions.params.length;
  const eventTypesParam = contextParamCount + 1;
  const payloadsParam = contextParamCount + 2;
  
  const cteQuery = `
    WITH expected_version AS (
      ${contextVersionQueryConditions.sql}
    )
    INSERT INTO events (event_type, payload)
    SELECT 
      unnest($${eventTypesParam}::text[]) as event_type,
      unnest($${payloadsParam}::jsonb[]) as payload
    WHERE (SELECT COALESCE(MAX(sequence_number), 0) FROM expected_version) = ${expectedMaxSeq}
    RETURNING *;
  `;

  return {
    sql: cteQuery,
    params: contextVersionQueryConditions.params
  };
}