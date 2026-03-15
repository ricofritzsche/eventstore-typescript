import {
  Event,
  EventFilter,
  EventQuery,
  EventRecord,
  EventStore,
  EventStreamNotifier,
  EventSubscription,
  HandleEvents,
  QueryResult,
} from '../../types';
import { createFilter, createQuery } from '../../filter';
import { MemoryEventStreamNotifier } from '../../notifiers';
import { processQuery } from '../memory/queryprocessor';
import { deserializeEvent } from './transform';

const NON_EXISTENT_EVENT_TYPE = '__NON_EXISTENT__' + Math.random().toString(36);

type SupabaseError = { message: string } | null;

interface SupabaseRpcResponse<T> {
  data: T | null;
  error: SupabaseError;
}

interface SupabaseSelectResponse<T> {
  data: T[] | null;
  error: SupabaseError;
}

interface SupabaseSelectBuilder<T> {
  order(column: string, options: { ascending: boolean }): PromiseLike<SupabaseSelectResponse<T>>;
}

interface SupabaseFromBuilder<T> {
  select(columns: string): SupabaseSelectBuilder<T>;
}

interface RealtimeChannelLike {
  on(
    eventType: 'postgres_changes',
    filter: { event: 'INSERT'; schema: string; table: string },
    callback: (payload: { new: Record<string, unknown> }) => void | Promise<void>
  ): RealtimeChannelLike;
  subscribe(callback?: (status: string) => void): RealtimeChannelLike;
  unsubscribe(): Promise<unknown>;
}

export interface SupabaseClientLike {
  rpc<T>(fn: string, args: Record<string, unknown>): PromiseLike<SupabaseRpcResponse<T>>;
  from<T>(table: string): SupabaseFromBuilder<T>;
  channel(name: string): RealtimeChannelLike;
  removeChannel?(channel: RealtimeChannelLike): Promise<unknown>;
}

export interface SupabaseEventStoreOptions {
  connectionString?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  tableName?: string;
  schemaName?: string;
  tenantId?: string;
  appendFunctionName?: string;
  notifier?: EventStreamNotifier;
  useRealtime?: boolean;
  client?: SupabaseClientLike;
}

export interface ParsedSupabaseConnectionString {
  supabaseUrl: string;
  supabaseAnonKey?: string;
  tableName?: string;
  schemaName?: string;
  tenantId?: string;
}

export function parseSupabaseConnectionString(connectionString: string): ParsedSupabaseConnectionString {
  const url = new URL(connectionString);
  const tableName = url.searchParams.get('table') ?? undefined;
  const supabaseAnonKey = url.searchParams.get('anonKey') ?? undefined;
  const schemaName = url.searchParams.get('schema') ?? undefined;
  const tenantId = url.searchParams.get('tenantId') ?? undefined;

  const sanitized = new URL(url.toString());
  sanitized.searchParams.delete('table');
  sanitized.searchParams.delete('anonKey');
  sanitized.searchParams.delete('schema');
  sanitized.searchParams.delete('tenantId');

  return {
    supabaseUrl: sanitized.toString(),
    ...(supabaseAnonKey ? { supabaseAnonKey } : {}),
    ...(tableName ? { tableName } : {}),
    ...(schemaName ? { schemaName } : {}),
    ...(tenantId ? { tenantId } : {}),
  };
}

export class SupabaseEventStore implements EventStore {
  private readonly client: SupabaseClientLike;
  private readonly notifier: EventStreamNotifier;
  private readonly tableName: string;
  private readonly schemaName: string;
  private readonly tenantId: string | undefined;
  private readonly appendFunctionName: string;
  private readonly useRealtime: boolean;
  private readonly subscriptions = new Map<string, RealtimeChannelLike>();
  private subscriptionCounter = 0;

  constructor(options: SupabaseEventStoreOptions = {}) {
    const parsed = options.connectionString
      ? parseSupabaseConnectionString(options.connectionString)
      : undefined;

    this.tableName = options.tableName ?? parsed?.tableName ?? 'events';
    this.schemaName = options.schemaName ?? parsed?.schemaName ?? 'public';
    this.tenantId = options.tenantId ?? parsed?.tenantId;
    this.appendFunctionName = options.appendFunctionName ?? 'eventstore_append';
    this.useRealtime = options.useRealtime ?? true;
    this.notifier = options.notifier ?? new MemoryEventStreamNotifier();

    if (options.client) {
      this.client = options.client;
      return;
    }

    const supabaseUrl = options.supabaseUrl ?? parsed?.supabaseUrl;
    const supabaseAnonKey = options.supabaseAnonKey ?? parsed?.supabaseAnonKey;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('eventstore-stores-supabase-err03: Supabase URL and anon key are required');
    }

    const supabaseJs = require('@supabase/supabase-js') as {
      createClient(url: string, key: string): SupabaseClientLike;
    };
    this.client = supabaseJs.createClient(supabaseUrl, supabaseAnonKey);
  }

  async query(filterCriteria: EventQuery): Promise<QueryResult>;
  async query(filterCriteria: EventFilter): Promise<QueryResult>;
  async query(filterCriteria: EventQuery | EventFilter): Promise<QueryResult> {
    const eventQuery = 'filters' in filterCriteria
      ? filterCriteria as EventQuery
      : createQuery(filterCriteria as EventFilter);

    const response = await this.client
      .from<Record<string, unknown>>(this.tableName)
      .select('sequence_number, tenant_id, occurred_at, event_type, payload')
      .order('sequence_number', { ascending: true });

    if (response.error) {
      throw new Error(`eventstore-stores-supabase-err04: Query failed: ${response.error.message}`);
    }

    const scopedRows = (response.data ?? []).filter((row) => this.matchesTenantScope(row));
    const allEvents = scopedRows.map((row) => deserializeEvent(row));
    const matchingEvents = processQuery(allEvents, eventQuery);
    const maxSequenceNumber = matchingEvents.length > 0
      ? matchingEvents[matchingEvents.length - 1]?.sequenceNumber ?? 0
      : 0;

    return {
      events: matchingEvents,
      maxSequenceNumber,
    };
  }

  async append(events: Event[]): Promise<void>;
  async append(events: Event[], filterCriteria: EventQuery, expectedMaxSequenceNumber: number): Promise<void>;
  async append(events: Event[], filterCriteria: EventFilter, expectedMaxSequenceNumber: number): Promise<void>;
  async append(
    events: Event[],
    filterCriteria?: EventQuery | EventFilter,
    expectedMaxSequenceNumber?: number
  ): Promise<void> {
    if (events.length === 0) return;

    let eventQuery: EventQuery;
    if (filterCriteria === undefined) {
      eventQuery = createQuery(createFilter([NON_EXISTENT_EVENT_TYPE]));
      expectedMaxSequenceNumber = 0;
    } else if ('filters' in filterCriteria) {
      eventQuery = filterCriteria;
      if (eventQuery.filters.length === 0) {
        eventQuery = createQuery(createFilter([NON_EXISTENT_EVENT_TYPE]));
        expectedMaxSequenceNumber = 0;
      }
    } else {
      eventQuery = createQuery(filterCriteria);
    }

    if (expectedMaxSequenceNumber === undefined) {
      throw new Error('eventstore-stores-supabase-err05: Expected max sequence number is required when a filter is provided');
    }

    const response = await this.client.rpc<Record<string, unknown>[]>(
      this.appendFunctionName,
      {
        p_schema_name: this.schemaName,
        p_table_name: this.tableName,
        p_query: eventQuery,
        p_expected_max_seq: expectedMaxSequenceNumber,
        p_tenant_id: this.tenantId ?? null,
        p_event_types: events.map((event) => event.eventType),
        p_payloads: events.map((event) => event.payload),
      }
    );

    if (response.error) {
      throw new Error(`eventstore-stores-supabase-err06: Append failed: ${response.error.message}`);
    }

    const insertedRows = (response.data ?? []).filter((row) => this.matchesTenantScope(row));
    if (insertedRows.length === 0) {
      throw new Error('eventstore-stores-supabase-err13: Context changed: events were modified between query() and append()');
    }

    if (!this.useRealtime) {
      const insertedEvents = insertedRows.map((row) => deserializeEvent(row));
      await this.notifier.notify(insertedEvents);
    }
  }

  async subscribe(handle: HandleEvents): Promise<EventSubscription> {
    if (!this.useRealtime) {
      return this.notifier.subscribe(handle);
    }

    const id = `supabase-sub-${++this.subscriptionCounter}`;
    const channel = this.client
      .channel(`eventstore-${this.tableName}-${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: this.schemaName,
          table: this.tableName,
        },
        async (payload) => {
          try {
            if (!this.matchesTenantScope(payload.new)) {
              return;
            }
            const event = deserializeEvent(payload.new);
            await handle([event]);
          } catch (error) {
            console.error(`eventstore-stores-supabase-err14: Failed to process realtime event for subscription ${id}:`, error);
          }
        }
      );

    channel.subscribe();
    this.subscriptions.set(id, channel);

    return {
      id,
      unsubscribe: async () => {
        const subscription = this.subscriptions.get(id);
        if (!subscription) return;
        this.subscriptions.delete(id);
        await subscription.unsubscribe();
        if (this.client.removeChannel) {
          await this.client.removeChannel(subscription);
        }
      },
    };
  }

  async close(): Promise<void> {
    for (const [id, channel] of this.subscriptions.entries()) {
      this.subscriptions.delete(id);
      await channel.unsubscribe();
      if (this.client.removeChannel) {
        await this.client.removeChannel(channel);
      }
    }
    await this.notifier.close();
  }

  private matchesTenantScope(row: Record<string, unknown>): boolean {
    if (!this.tenantId) {
      const rowTenantId = row.tenant_id;
      return rowTenantId === null || rowTenantId === undefined;
    }
    const rowTenantId = row.tenant_id;
    return typeof rowTenantId === 'string' && rowTenantId === this.tenantId;
  }
}
