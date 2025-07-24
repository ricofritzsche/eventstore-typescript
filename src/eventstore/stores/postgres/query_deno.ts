import { EventFilter } from '../../types.ts';

export function buildContextQuery(filter: EventFilter): { sql: string; params: unknown[] } {
  let query = 'SELECT * FROM events WHERE event_type = ANY($1)';
  const params: unknown[] = [filter.eventTypes];

  if (filter.payloadPredicates && filter.payloadPredicates.length > 0) {
    const orConditions = filter.payloadPredicates.map((_: Record<string, unknown>, index: number) => {
      const paramIndex = params.length + 1;
      params.push(JSON.stringify(filter.payloadPredicates![index]));
      return `payload @> $${paramIndex}`;
    });
    query += ` AND (${orConditions.join(' OR ')})`;
  }

  query += ' ORDER BY sequence_number ASC';
  return { sql: query, params };
}

export function buildContextVersionQuery(filter: EventFilter): { sql: string; params: unknown[] } {
  let query = 'SELECT sequence_number FROM events WHERE event_type = ANY($1)';
  const params: unknown[] = [filter.eventTypes];

  if (filter.payloadPredicates && filter.payloadPredicates.length > 0) {
    const orConditions = filter.payloadPredicates.map((_: Record<string, unknown>, index: number) => {
      const paramIndex = params.length + 1;
      params.push(JSON.stringify(filter.payloadPredicates![index]));
      return `payload @> $${paramIndex}`;
    });
    query += ` AND (${orConditions.join(' OR ')})`;
  }

  query += ' ORDER BY sequence_number ASC';
  return { sql: query, params };
}