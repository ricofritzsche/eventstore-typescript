import { EventFilter, EventQuery } from '../../types';


export function compileContextQueryConditions(query: EventQuery, paramsBaseIndex: number = 0): { sql: string; params: unknown[] } {
  let sql = '';
  const params: unknown[] = [];

  if (query.filters && query.filters.length > 0) {
    for(const filter of query.filters) {
      if (sql.length > 0) {
        sql += ' OR ';
      }

      const filterClause = compileContextQueryConditionsFilter(filter, paramsBaseIndex + params.length);
      if (filterClause.sql.length > 0)
        sql += `(${filterClause.sql})`;

      params.push(...filterClause.params);
    }
  }

  return { sql, params };
}

function compileContextQueryConditionsFilter(filter: EventFilter, paramsBaseIndex:number): { sql: string; params: unknown[] } {
  let sql = ''
  const params: unknown[] = [];

  if (filter.eventTypes && filter.eventTypes.length > 0) {
    params.push(filter.eventTypes);
    sql += `event_type = ANY($${paramsBaseIndex + params.length})`;
  }

  if (filter.payloadPredicates && filter.payloadPredicates.length > 0) {
    const orConditions = filter.payloadPredicates.map((predicate: Record<string, unknown>) => {
      params.push(JSON.stringify(predicate));
      return `payload @> $${paramsBaseIndex + params.length}`;
    });

    if (sql.length > 0) sql += ' AND ';
    sql += `(${orConditions.join(' OR ')})`;
  }
  if (sql.length > 0) sql = `(${sql})`

  return {
    sql,
    params
  };
}


export function buildContextQuerySql(query: EventQuery): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  let whereClause = '';

  if (query.options?.minSequenceNumber !== undefined) {
    params.push(query.options.minSequenceNumber);
    whereClause = `sequence_number > $${params.length}`;
  }

  const conditions = compileContextQueryConditions(query, params.length);
  params.push(...conditions.params);

  if (conditions.sql.length > 0) {
    whereClause = whereClause.length > 0
      ? `${whereClause} AND ${conditions.sql}`
      : conditions.sql;
  }

  let sql = 'SELECT * FROM events';
  if (whereClause.length > 0) sql += ` WHERE ${whereClause}`;
  sql += ' ORDER BY sequence_number ASC';

  return { sql, params };
}


export function buildAppendSql(query: EventQuery, expectedMaxSeq: number): { sql: string, params: unknown[] } {
  const conditions = compileContextQueryConditions(query);
  
  const contextParamCount = conditions.params.length;
  const expectedMaxSeqParam = contextParamCount + 1;
  const eventTypesParam = contextParamCount + 2;
  const payloadsParam = contextParamCount + 3;

  return {
    sql: 
`WITH context AS (SELECT MAX(sequence_number) AS max_seq FROM events${conditions.sql.length > 0 ? " WHERE " + conditions.sql : ""})
INSERT INTO events (event_type, payload)
SELECT unnest($${eventTypesParam}::text[]), unnest($${payloadsParam}::jsonb[]) FROM context WHERE COALESCE(max_seq, 0) = $${expectedMaxSeqParam}
RETURNING *`,
    params: [...conditions.params, expectedMaxSeq]
  };
}
