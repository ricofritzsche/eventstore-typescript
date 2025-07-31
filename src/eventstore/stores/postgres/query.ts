import { EventFilter, EventQuery } from '../../types';


export function compileContextQueryConditions(query: EventQuery): { sql: string; params: unknown[] } {
  let sql = '';
  const params: unknown[] = [];

  if (query.filters && query.filters.length > 0) {
    for(const filter of query.filters) {
      if (sql.length > 0) {
        sql += ' OR ';
      }

      const filterClause = compileContextQueryConditionsFilter(filter, params.length);
      if (filterClause.sql.length > 0)
        sql += `(${filterClause.sql})`;

      params.push(...filterClause.params);
    }
  }
console.log(`### query: <${sql}>`)
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
console.log(`   *** filer: <${sql}>`)
  return {
    sql,
    params
  };
}


export function buildContextQuery(query: EventQuery): { sql: string; params: unknown[] } {
  const conditions = compileContextQueryConditions(query);

  let sql = 'SELECT * FROM events ';
  if (conditions.sql.length > 0) sql += `WHERE ${conditions.sql}`;
  sql += ' ORDER BY sequence_number ASC';

  return {
    sql,
    params: conditions.params
  };
}