import { createFilter, createQuery } from '../../../filter';
import { SupabaseClientLike, SupabaseEventStore, parseSupabaseConnectionString } from '../store';

class MockRealtimeChannel {
  private insertCallback?: (payload: { new: Record<string, unknown> }) => void | Promise<void>;

  on(
    _eventType: 'postgres_changes',
    _filter: { event: 'INSERT'; schema: string; table: string },
    callback: (payload: { new: Record<string, unknown> }) => void | Promise<void>
  ): MockRealtimeChannel {
    this.insertCallback = callback;
    return this;
  }

  subscribe(_callback?: (status: string) => void): MockRealtimeChannel {
    return this;
  }

  async unsubscribe(): Promise<void> {
    return;
  }

  async emitInsert(row: Record<string, unknown>): Promise<void> {
    if (!this.insertCallback) {
      throw new Error('missing callback');
    }
    await this.insertCallback({ new: row });
  }
}

class MockSupabaseClient implements SupabaseClientLike {
  rows: Record<string, unknown>[] = [];
  rpcData: Record<string, unknown>[] = [];
  rpcError: { message: string } | null = null;
  lastRpcCall: { fn: string; args: Record<string, unknown> } | null = null;
  readonly channelInstance = new MockRealtimeChannel();

  async rpc<T>(fn: string, args: Record<string, unknown>): Promise<{ data: T | null; error: { message: string } | null }> {
    this.lastRpcCall = { fn, args };
    return { data: this.rpcData as T, error: this.rpcError };
  }

  from<T>(_table: string): { select(columns: string): { order(column: string, options: { ascending: boolean }): Promise<{ data: T[] | null; error: { message: string } | null }> } } {
    return {
      select: (_columns: string) => ({
        order: async (_column: string, _options: { ascending: boolean }) => ({
          data: this.rows as T[],
          error: null,
        }),
      }),
    };
  }

  channel(_name: string): MockRealtimeChannel {
    return this.channelInstance;
  }
}

describe('SupabaseEventStore', () => {
  it('parses supabase connection string with table and anonKey', () => {
    const parsed = parseSupabaseConnectionString(
      'https://project.supabase.co?anonKey=abc123&table=events_spa&schema=public&tenantId=t-1'
    );

    expect(parsed.supabaseUrl).toBe('https://project.supabase.co/');
    expect(parsed.supabaseAnonKey).toBe('abc123');
    expect(parsed.tableName).toBe('events_spa');
    expect(parsed.schemaName).toBe('public');
    expect(parsed.tenantId).toBe('t-1');
  });

  it('queries and filters events client-side', async () => {
    const client = new MockSupabaseClient();
    client.rows = [
      { sequence_number: 1, tenant_id: null, occurred_at: '2024-01-01T00:00:00.000Z', event_type: 'A', payload: { id: 1 } },
      { sequence_number: 2, tenant_id: null, occurred_at: '2024-01-01T00:01:00.000Z', event_type: 'B', payload: { id: 2 } },
    ];

    const store = new SupabaseEventStore({ client, tableName: 'events_spa' });
    const result = await store.query(createQuery(createFilter(['B'])));

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.eventType).toBe('B');
    expect(result.maxSequenceNumber).toBe(2);
  });

  it('append without explicit filter sends deterministic expected max args', async () => {
    const client = new MockSupabaseClient();
    client.rpcData = [
      { sequence_number: 1, tenant_id: null, occurred_at: '2024-01-01T00:00:00.000Z', event_type: 'A', payload: { id: 1 } },
    ];

    const store = new SupabaseEventStore({ client, tableName: 'events_spa', useRealtime: false });
    await store.append([{ eventType: 'A', payload: { id: 1 } }]);

    expect(client.lastRpcCall?.fn).toBe('eventstore_append');
    expect(client.lastRpcCall?.args.p_expected_max_seq).toBe(0);
    expect(client.lastRpcCall?.args.p_table_name).toBe('events_spa');
    expect(client.lastRpcCall?.args.p_schema_name).toBe('public');
    expect(client.lastRpcCall?.args.p_tenant_id).toBeNull();
    expect(client.lastRpcCall?.args.p_event_types).toEqual(['A']);
    expect(client.lastRpcCall?.args.p_payloads).toEqual([{ id: 1 }]);
  });

  it('scopes query and append by tenantId when configured', async () => {
    const client = new MockSupabaseClient();
    client.rows = [
      { sequence_number: 1, tenant_id: 'tenant-1', occurred_at: '2024-01-01T00:00:00.000Z', event_type: 'A', payload: { id: 1 } },
      { sequence_number: 2, tenant_id: 'tenant-2', occurred_at: '2024-01-01T00:01:00.000Z', event_type: 'A', payload: { id: 2 } },
    ];
    client.rpcData = [
      { sequence_number: 3, tenant_id: 'tenant-1', occurred_at: '2024-01-01T00:02:00.000Z', event_type: 'A', payload: { id: 3 } },
    ];

    const store = new SupabaseEventStore({ client, tableName: 'events_spa', tenantId: 'tenant-1' });
    const result = await store.query(createQuery(createFilter(['A'])));
    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.sequenceNumber).toBe(1);

    await store.append([{ eventType: 'A', payload: { id: 3 } }], createFilter(['A']), 1);
    expect(client.lastRpcCall?.args.p_tenant_id).toBe('tenant-1');
  });

  it('shared mode only sees rows with tenant_id NULL', async () => {
    const client = new MockSupabaseClient();
    client.rows = [
      { sequence_number: 1, tenant_id: null, occurred_at: '2024-01-01T00:00:00.000Z', event_type: 'A', payload: { id: 1 } },
      { sequence_number: 2, tenant_id: 'tenant-2', occurred_at: '2024-01-01T00:01:00.000Z', event_type: 'A', payload: { id: 2 } },
    ];

    const store = new SupabaseEventStore({ client, tableName: 'events_spa' });
    const result = await store.query(createQuery(createFilter(['A'])));

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.sequenceNumber).toBe(1);
  });

  it('throws context changed when append returns no rows', async () => {
    const client = new MockSupabaseClient();
    client.rpcData = [];

    const store = new SupabaseEventStore({ client, tableName: 'events_spa' });
    await expect(
      store.append([{ eventType: 'A', payload: { id: 1 } }], createFilter(['A']), 1)
    ).rejects.toThrow('eventstore-stores-supabase-err13');
  });

  it('subscribes via realtime and maps incoming rows', async () => {
    const client = new MockSupabaseClient();
    const store = new SupabaseEventStore({ client, tableName: 'events_spa', tenantId: 'tenant-1' });

    const received: string[] = [];
    const sub = await store.subscribe(async (events) => {
      received.push(events[0]?.eventType ?? '');
    });

    await client.channelInstance.emitInsert({
      sequence_number: 10,
      tenant_id: 'tenant-2',
      occurred_at: '2024-01-01T00:00:00.000Z',
      event_type: 'OtherTenantEvent',
      payload: { id: 'r0' },
    });
    await client.channelInstance.emitInsert({
      sequence_number: 11,
      tenant_id: 'tenant-1',
      occurred_at: '2024-01-01T00:00:00.000Z',
      event_type: 'RealtimeEvent',
      payload: { id: 'r1' },
    });

    expect(received).toEqual(['RealtimeEvent']);
    await sub.unsubscribe();
    await store.close();
  });
});
