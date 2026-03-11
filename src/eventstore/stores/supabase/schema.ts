export interface SupabaseSetupSqlOptions {
  tableName: string;
  schemaName?: string;
  appendFunctionName?: string;
}

function quoteIdentifier(identifier: string): string {
  if (!identifier || identifier.trim().length === 0) {
    throw new Error('eventstore-stores-supabase-err07: Identifier must not be empty');
  }
  if (identifier.includes('\u0000')) {
    throw new Error('eventstore-stores-supabase-err08: Identifier must not contain null bytes');
  }
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function createSupabaseSetupSql(options: SupabaseSetupSqlOptions): string {
  const schemaName = options.schemaName ?? 'public';
  const appendFunctionName = options.appendFunctionName ?? 'eventstore_append';

  const schemaSql = quoteIdentifier(schemaName);
  const tableSql = quoteIdentifier(options.tableName);
  const functionSql = quoteIdentifier(appendFunctionName);

  return `
CREATE TABLE IF NOT EXISTS ${schemaSql}.${tableSql} (
  sequence_number BIGSERIAL PRIMARY KEY,
  tenant_id UUID NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${options.tableName}_tenant_seq`)} ON ${schemaSql}.${tableSql}(tenant_id, sequence_number);
CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${options.tableName}_type`)} ON ${schemaSql}.${tableSql}(event_type);
CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${options.tableName}_occurred_at`)} ON ${schemaSql}.${tableSql}(occurred_at);
CREATE INDEX IF NOT EXISTS ${quoteIdentifier(`idx_${options.tableName}_payload_gin`)} ON ${schemaSql}.${tableSql} USING gin(payload);

ALTER TABLE ${schemaSql}.${tableSql} ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ${quoteIdentifier(`${options.tableName}_select_authenticated`)} ON ${schemaSql}.${tableSql};
CREATE POLICY ${quoteIdentifier(`${options.tableName}_select_authenticated`)}
  ON ${schemaSql}.${tableSql}
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS ${quoteIdentifier(`${options.tableName}_insert_authenticated`)} ON ${schemaSql}.${tableSql};
CREATE POLICY ${quoteIdentifier(`${options.tableName}_insert_authenticated`)}
  ON ${schemaSql}.${tableSql}
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION ${schemaSql}.${functionSql}(
  p_schema_name text,
  p_table_name text,
  p_query jsonb,
  p_expected_max_seq bigint,
  p_tenant_id uuid,
  p_event_types text[],
  p_payloads jsonb[]
)
RETURNS TABLE (
  sequence_number bigint,
  tenant_id uuid,
  occurred_at timestamptz,
  event_type text,
  payload jsonb
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  append_sql text;
BEGIN
  IF p_schema_name IS NULL OR p_table_name IS NULL THEN
    RAISE EXCEPTION 'eventstore-stores-supabase-err01: schema and table names are required';
  END IF;

  IF COALESCE(array_length(p_event_types, 1), 0) <> COALESCE(array_length(p_payloads, 1), 0) THEN
    RAISE EXCEPTION 'eventstore-stores-supabase-err02: event_types and payloads length mismatch';
  END IF;

  append_sql := format($sql$
    WITH context AS (
      SELECT MAX(e.sequence_number) AS max_seq
      FROM %I.%I e
      WHERE
        (
          ($5::uuid IS NULL AND e.tenant_id IS NULL)
          OR e.tenant_id = $5::uuid
        )
        AND
        (
          COALESCE(jsonb_array_length(COALESCE($1->'filters', '[]'::jsonb)), 0) = 0
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE($1->'filters', '[]'::jsonb)) AS filter
            WHERE (
              (
                COALESCE(jsonb_array_length(filter->'eventTypes'), 0) = 0
                OR e.event_type IN (
                  SELECT jsonb_array_elements_text(filter->'eventTypes')
                )
              )
              AND
              (
                COALESCE(jsonb_array_length(filter->'payloadPredicates'), 0) = 0
                OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(filter->'payloadPredicates') AS predicate
                  WHERE e.payload @> predicate
                )
              )
            )
          )
        )
    )
    INSERT INTO %I.%I (tenant_id, event_type, payload)
    SELECT $5::uuid, event_type, payload
    FROM unnest($2::text[], $3::jsonb[]) AS t(event_type, payload)
    WHERE COALESCE((SELECT max_seq FROM context), 0) = $4
    RETURNING sequence_number, tenant_id, occurred_at, event_type, payload
  $sql$, p_schema_name, p_table_name, p_schema_name, p_table_name);

  RETURN QUERY EXECUTE append_sql USING p_query, p_event_types, p_payloads, p_expected_max_seq, p_tenant_id;
END;
$$;
`.trim();
}
