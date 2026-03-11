import { createSupabaseSetupSql } from '../schema';

describe('Supabase schema setup SQL', () => {
  it('includes table, policies and append function', () => {
    const sql = createSupabaseSetupSql({ tableName: 'events_app' });

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "public"."events_app"');
    expect(sql).toContain('tenant_id UUID NULL');
    expect(sql).toContain('idx_events_app_tenant_seq');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('CREATE POLICY "events_app_select_authenticated"');
    expect(sql).toContain('CREATE POLICY "events_app_insert_authenticated"');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION "public"."eventstore_append"');
    expect(sql).toContain('p_tenant_id uuid');
  });
});
