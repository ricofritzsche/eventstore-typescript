import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseEventStore, createFilter, createQuery } from '../src/eventstore';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_TEST_URL;
const supabaseKey = process.env.SUPABASE_TEST_KEY;
const supabaseTable = process.env.SUPABASE_TEST_TABLE ?? 'events_spa';
const supabaseSchema = process.env.SUPABASE_TEST_SCHEMA ?? 'public';
const appendFunctionName = process.env.SUPABASE_TEST_APPEND_FUNCTION ?? 'eventstore_append';
const supabaseServiceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const loginEmail = process.env.SUPABASE_TEST_EMAIL;
const loginPassword = process.env.SUPABASE_TEST_PASSWORD;
const tenantIdFromEnv = process.env.SUPABASE_TEST_TENANT_ID;
const tenantAEmail = process.env.SUPABASE_TEST_TENANT_A_EMAIL;
const tenantAPassword = process.env.SUPABASE_TEST_TENANT_A_PASSWORD;
const tenantBEmail = process.env.SUPABASE_TEST_TENANT_B_EMAIL;
const tenantBPassword = process.env.SUPABASE_TEST_TENANT_B_PASSWORD;

const hasRequiredConfig = Boolean(supabaseUrl && supabaseKey);
const describeIfConfigured = hasRequiredConfig ? describe : describe.skip;
const itIfIsolationConfigured = (
  tenantAEmail && tenantAPassword && tenantBEmail && tenantBPassword
) ? it : it.skip;

async function signInAndResolveTenant(
  client: { auth: { signInWithPassword(args: { email: string; password: string }): Promise<{ data: { user: { id: string } | null }; error: unknown }> } },
  email: string,
  password: string
): Promise<string> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw error ?? new Error('supabase-scenario-err01: Login failed');
  }
  return data.user.id;
}

describeIfConfigured('Supabase scenario (real database)', () => {
  it('appends and queries events with optimistic locking', async () => {
    const client = createClient(supabaseUrl!, supabaseKey!);

    let tenantId = tenantIdFromEnv;
    if (loginEmail && loginPassword) {
      tenantId = await signInAndResolveTenant(client, loginEmail, loginPassword);
    }

    const store = new SupabaseEventStore({
      client,
      tableName: supabaseTable,
      schemaName: supabaseSchema,
      appendFunctionName,
      ...(tenantId ? { tenantId } : {}),
      useRealtime: false,
    });

    const runId = uuidv4();
    const scenarioFilter = createFilter(
      ['ScenarioOpened', 'ScenarioDeposited', 'ScenarioConflictTrigger'],
      [{ runId }]
    );
    const scenarioQuery = createQuery(scenarioFilter);

    await store.append([
      { eventType: 'ScenarioOpened', payload: { runId, amount: 100 } },
      { eventType: 'ScenarioDeposited', payload: { runId, amount: 25 } },
    ]);

    const firstRead = await store.query(scenarioQuery);
    expect(firstRead.events.length).toBe(2);
    expect(firstRead.events[0]?.payload.runId).toBe(runId);
    expect(firstRead.maxSequenceNumber).toBeGreaterThan(0);

    await store.append(
      [{ eventType: 'ScenarioDeposited', payload: { runId, amount: 50 } }],
      scenarioQuery,
      firstRead.maxSequenceNumber
    );

    const secondRead = await store.query(scenarioQuery);
    expect(secondRead.events.length).toBe(3);
    expect(secondRead.maxSequenceNumber).toBeGreaterThan(firstRead.maxSequenceNumber);

    const staleExpected = secondRead.maxSequenceNumber;
    await store.append(
      [{ eventType: 'ScenarioConflictTrigger', payload: { runId, marker: 'newer-write' } }],
      scenarioQuery,
      staleExpected
    );

    await expect(
      store.append(
        [{ eventType: 'ScenarioDeposited', payload: { runId, amount: 1 } }],
        scenarioQuery,
        staleExpected
      )
    ).rejects.toThrow('eventstore-stores-supabase-err13');

    await store.close();
  });

  itIfIsolationConfigured('isolates events between two tenants', async () => {
    const clientA = createClient(supabaseUrl!, supabaseKey!);
    const clientB = createClient(supabaseUrl!, supabaseKey!);

    const tenantAId = await signInAndResolveTenant(clientA, tenantAEmail!, tenantAPassword!);
    const tenantBId = await signInAndResolveTenant(clientB, tenantBEmail!, tenantBPassword!);

    if (tenantAId === tenantBId) {
      throw new Error('supabase-scenario-err02: tenant A and tenant B must be different users');
    }

    const storeA = new SupabaseEventStore({
      client: clientA,
      tableName: supabaseTable,
      schemaName: supabaseSchema,
      appendFunctionName,
      tenantId: tenantAId,
      useRealtime: false,
    });

    const storeB = new SupabaseEventStore({
      client: clientB,
      tableName: supabaseTable,
      schemaName: supabaseSchema,
      appendFunctionName,
      tenantId: tenantBId,
      useRealtime: false,
    });

    const sharedReaderOnTenantA = new SupabaseEventStore({
      client: clientA,
      tableName: supabaseTable,
      schemaName: supabaseSchema,
      appendFunctionName,
      useRealtime: false,
    });

    const runId = uuidv4();
    const isolationFilter = createFilter(
      ['TenantIsolationEvent'],
      [{ runId }]
    );
    const isolationQuery = createQuery(isolationFilter);

    await storeA.append([
      { eventType: 'TenantIsolationEvent', payload: { runId, owner: 'A' } },
    ]);

    await storeB.append([
      { eventType: 'TenantIsolationEvent', payload: { runId, owner: 'B' } },
    ]);

    const resultA = await storeA.query(isolationQuery);
    const resultB = await storeB.query(isolationQuery);
    const resultSharedReaderOnA = await sharedReaderOnTenantA.query(isolationQuery);

    expect(resultA.events.length).toBe(1);
    expect(resultA.events[0]?.payload.owner).toBe('A');
    expect(resultB.events.length).toBe(1);
    expect(resultB.events[0]?.payload.owner).toBe('B');
    expect(resultSharedReaderOnA.events.length).toBe(0);

    if (supabaseServiceRoleKey) {
      const serviceClient = createClient(supabaseUrl!, supabaseServiceRoleKey);
      const sharedWriterStore = new SupabaseEventStore({
        client: serviceClient,
        tableName: supabaseTable,
        schemaName: supabaseSchema,
        appendFunctionName,
        useRealtime: false,
      });

      await sharedWriterStore.append([
        { eventType: 'TenantIsolationEvent', payload: { runId, owner: 'SHARED' } },
      ]);

      const resultAfterSharedA = await storeA.query(isolationQuery);
      const resultAfterSharedB = await storeB.query(isolationQuery);

      expect(resultAfterSharedA.events.length).toBe(1);
      expect(resultAfterSharedA.events[0]?.payload.owner).toBe('A');
      expect(resultAfterSharedB.events.length).toBe(1);
      expect(resultAfterSharedB.events[0]?.payload.owner).toBe('B');

      await sharedWriterStore.close();
    }

    await storeA.close();
    await storeB.close();
    await sharedReaderOnTenantA.close();
  });
});
