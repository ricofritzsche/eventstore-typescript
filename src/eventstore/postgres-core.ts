import { IEventStore, IEventFilter, IHasEventType, IQueryResult, IEventRecord } from './types';


// The SQL query to return all context event records that match the filter
export function buildContextQuery(filter: IEventFilter):{ sql: string; params: unknown[] } {
    let query = 'SELECT * FROM events WHERE event_type = ANY($1)';
    const params: unknown[] = [filter.eventTypes];

    if (filter.payloadPredicates && Object.keys(filter.payloadPredicates).length > 0) {
      query += ' AND payload @> $2';
      params.push(JSON.stringify(filter.payloadPredicates));
    }

    if (filter.payloadPredicateOptions && filter.payloadPredicateOptions.length > 0) {
      const orConditions = filter.payloadPredicateOptions.map((_, index) => {
        const paramIndex = params.length + 1;
        params.push(JSON.stringify(filter.payloadPredicateOptions![index]));
        return `payload @> $${paramIndex}`;
      });
      query += ` AND (${orConditions.join(' OR ')})`;
    }

    query += ' ORDER BY sequence_number ASC';
    return {
      sql: query,
      params
    };
  }


  // Only the SQL conditions to return the current max sequence number for the context
  function buildContextVersionQueryConditions(filter: IEventFilter): { sql: string; params: unknown[] } {
    let sql = 'event_type = ANY($1)';

    const params: unknown[] = [filter.eventTypes];

    if (filter.payloadPredicates && Object.keys(filter.payloadPredicates).length > 0) {
      sql += ' AND payload @> $2';
      params.push(JSON.stringify(filter.payloadPredicates));
    }

    if (filter.payloadPredicateOptions && filter.payloadPredicateOptions.length > 0) {
      const orConditions = filter.payloadPredicateOptions.map((_, index) => {
        const paramIndex = params.length + 1;
        params.push(JSON.stringify(filter.payloadPredicateOptions![index]));
        return `payload @> $${paramIndex}`;
      });
      sql += ` AND (${orConditions.join(' OR ')})`;
    }

    return { sql, params };
  }


  // The SQL query to insert new events into the events table if and only if the context has not changed
  export function buildCteInsertQuery(filter: IEventFilter, expectedMaxSeq: number): {sql:string, params: unknown[]} {
    const contextVersionQueryConditions = buildContextVersionQueryConditions(filter);
    return buildCteInsertQuerySql();


    function buildCteInsertQuerySql() {
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
  }