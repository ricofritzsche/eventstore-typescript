# SupabaseEventStore

This store persists events in a Supabase Postgres table and is designed to work in browser-based SPA applications.

It supports:
- A single shared event table (`tenant_id = NULL`)
- Tenant-scoped event streams (`tenant_id = <uuid>`)
- Real-time subscriptions via Supabase Realtime

## When To Use Which Mode

### 1. Without `tenantId` (shared stream)
Use this when your app has one global stream and no tenant separation in the store instance.

- Constructor does **not** set `tenantId`
- Rows are read/written with `tenant_id = NULL`
- Simple setup, useful for single-tenant apps or local prototypes

### 2. With `tenantId` (tenant-scoped stream)
Use this when one store instance should only operate on one tenant/user stream.

- Constructor sets `tenantId` once
- `query`, `append`, and realtime subscription are scoped to that tenant
- Recommended for multi-tenant apps

## Generate SQL Setup Script For A Table

Use `createSupabaseSetupSql` to generate the SQL migration for your table:

```ts
import { createSupabaseSetupSql } from '@ricofritzsche/eventstore';

const sql = createSupabaseSetupSql({
  tableName: 'events_spa',
  schemaName: 'public', // optional, defaults to "public"
  appendFunctionName: 'eventstore_append', // optional, defaults to "eventstore_append"
});

console.log(sql);
```

What the optional fields mean:
- `schemaName`: Postgres schema where table and RPC function are created.
  Alternative: omit it and use the default `public`.
- `appendFunctionName`: name of the SQL function used by `append(...)` (called via Supabase RPC).
  Alternative: omit it and use the default `eventstore_append`.

Why show optional fields at all:
- You may need them for naming conventions or to avoid collisions with existing SQL functions.
- If you do not need custom naming, keep the call minimal:

```ts
const sql = createSupabaseSetupSql({ tableName: 'events_spa' });
```

From this repository, you can also generate the same SQL via CLI:

```bash
npm run supabase:sql -- --table <tableName> [--schema <schemaName>] [--function <appendFunctionName>]
```

Examples:

```bash
# minimal (defaults: schema=public, function=eventstore_append)
npm run supabase:sql -- --table events_spa

# custom schema
npm run supabase:sql -- --table events_spa --schema app

# custom append RPC function name
npm run supabase:sql -- --table events_spa --function my_eventstore_append
```

The command prints SQL to stdout.

Then copy the generated SQL into:
- Supabase Dashboard -> SQL Editor -> Run
- or your migration workflow (`supabase db push`, etc.)

The script creates:
- Event table (including `tenant_id`)
- Indexes
- RLS policies
- RPC function used by `append` (`eventstore_append`)

## SupabaseEventStore Examples

### A) Shared stream (no `tenantId`)

```ts
import { SupabaseEventStore } from '@ricofritzsche/eventstore';

const store = new SupabaseEventStore({
  supabaseUrl: 'https://YOUR_PROJECT_ID.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY',
  tableName: 'events_spa',
});
```

### B) Tenant-scoped stream (`tenantId`)

```ts
import { SupabaseEventStore } from '@ricofritzsche/eventstore';

const store = new SupabaseEventStore({
  supabaseUrl: 'https://YOUR_PROJECT_ID.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY',
  tableName: 'events_spa',
  tenantId: '2a8e7f57-9f62-4dc2-b8ef-a9a0bca53f9e',
});
```

Example with Supabase login (email/password) before creating the store:

```ts
import { createClient } from '@supabase/supabase-js';
import { SupabaseEventStore } from '@ricofritzsche/eventstore';

const supabaseUrl = 'https://YOUR_PROJECT_ID.supabase.co';
const supabaseAnonKey = 'YOUR_ANON_KEY';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'your-password',
});

if (signInError || !signInData.user) {
  throw signInError ?? new Error('Login failed');
}

const tenantId = signInData.user.id; // UUID from auth.users.id

const store = new SupabaseEventStore({
  supabaseUrl,
  supabaseAnonKey,
  tableName: 'events_spa',
  tenantId,
});
```

### C) Connection-string style

```ts
import { SupabaseEventStore } from '@ricofritzsche/eventstore';

const store = new SupabaseEventStore({
  connectionString:
    'https://YOUR_PROJECT_ID.supabase.co?anonKey=YOUR_ANON_KEY&table=events_spa&schema=public&tenantId=2a8e7f57-9f62-4dc2-b8ef-a9a0bca53f9e',
});
```

## Where To Get `supabaseAnonKey`

1. Open Supabase Dashboard
2. Select your project
3. Go to `Settings` -> `API`
4. Copy the `anon` / `public` key

Important:
- Use only the `anon` key in browser apps
- Do **not** use the service-role key in frontend code

## Where To Get `tenantId`

In most setups, `tenantId` is the authenticated user id (`auth.users.id`), which is a UUID.

You can read it after login from Supabase Auth:

```ts
const { data } = await supabase.auth.getUser();
const tenantId = data.user?.id; // UUID
```

Use that value when constructing `SupabaseEventStore` (if you use tenant-scoped mode).

## Notes About RLS

- The generated SQL enables RLS and creates basic authenticated policies.
- In production, adapt policies to your security model (for example strict tenant checks against JWT claims).
- `tenantId` scoping in the store is convenience and consistency; data security must be enforced by RLS policies.

## Real Supabase Scenario Test (from this repository)

You can run an integration test against a real Supabase table:

```bash
npm run test:supabase:scenario
```

Required `.env` values:

```bash
SUPABASE_TEST_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_TEST_KEY=YOUR_ANON_OR_SERVICE_KEY
```

Optional `.env` values:

```bash
SUPABASE_TEST_TABLE=events_spa
SUPABASE_TEST_SCHEMA=public
SUPABASE_TEST_APPEND_FUNCTION=eventstore_append
SUPABASE_TEST_SERVICE_ROLE_KEY=<optional-for-shared-seeding>
SUPABASE_TEST_TENANT_ID=<uuid>
SUPABASE_TEST_EMAIL=user@example.com
SUPABASE_TEST_PASSWORD=your-password
SUPABASE_TEST_TENANT_A_EMAIL=tenant-a@example.com
SUPABASE_TEST_TENANT_A_PASSWORD=tenant-a-password
SUPABASE_TEST_TENANT_B_EMAIL=tenant-b@example.com
SUPABASE_TEST_TENANT_B_PASSWORD=tenant-b-password
```

How it works:
- If `SUPABASE_TEST_EMAIL` and `SUPABASE_TEST_PASSWORD` are set, the test signs in via Supabase Auth.
- If `SUPABASE_TEST_TENANT_ID` is not set, it uses `user.id` from the login session as `tenantId`.
- The scenario appends events, queries them back, and verifies optimistic-lock conflict behavior.
- If `SUPABASE_TEST_TENANT_A_*` and `SUPABASE_TEST_TENANT_B_*` are set, a second scenario verifies tenant isolation
  (tenant A does not see tenant B events and vice versa).
- The second scenario also verifies that a store instance without `tenantId` does not see tenant rows.
- If `SUPABASE_TEST_SERVICE_ROLE_KEY` is set, it additionally seeds a `tenant_id = NULL` event and verifies
  that tenant-scoped stores do not see shared/no-tenant events.
- If required env vars are missing, the test is skipped automatically.
