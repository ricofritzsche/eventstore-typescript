import { EventFilter } from '../../types.ts';
import { buildContextVersionQuery } from './query_deno.ts';

export function buildCteInsertQuery(filter: EventFilter, expectedMaxSeq: number): { sql: string, params: unknown[] } {
  const contextVersionQueryConditions = buildContextVersionQuery(filter);
  
  const cteQuery = `
    WITH expected_version AS (
      ${contextVersionQueryConditions.sql}
    )
    INSERT INTO events (event_type, payload, occurred_at)
    SELECT 
      unnest($${contextVersionQueryConditions.params.length + 1}::text[]) as event_type,
      unnest($${contextVersionQueryConditions.params.length + 2}::json[]) as payload,
      unnest($${contextVersionQueryConditions.params.length + 3}::timestamp[]) as occurred_at
    WHERE (SELECT COALESCE(MAX(sequence_number), 0) FROM expected_version) = $${contextVersionQueryConditions.params.length + 4}
    RETURNING *;
  `;

  return {
    sql: cteQuery,
    params: contextVersionQueryConditions.params
  };
}