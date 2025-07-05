import { EventStore, EventFilter, HasEventType } from './index';
import dotenv from 'dotenv';


interface AssetRegistered extends HasEventType {
  assetId: string;
  name: string;
  description?: string;
  occurredAt: Date;
  version: string;
  
  eventType(): string;
  eventVersion?(): string;
}

class AssetRegisteredEvent implements AssetRegistered {
  public readonly description?: string;
  
  constructor(
    public readonly assetId: string,
    public readonly name: string,
    description?: string,
    public readonly occurredAt: Date = new Date(),
    public readonly version: string = '1.0'
  ) {
    if (description !== undefined) {
      this.description = description;
    }
  }

  eventType(): string {
    return 'AssetRegistered';
  }

  eventVersion(): string {
    return this.version;
  }
}

interface DeviceBound extends HasEventType {
  deviceId: string;
  assetId: string;
  boundAt: Date;
  
  eventType(): string;
  eventVersion?(): string;
}

class DeviceBoundEvent implements DeviceBound {
  constructor(
    public readonly deviceId: string,
    public readonly assetId: string,
    public readonly boundAt: Date = new Date()
  ) {}

  eventType(): string {
    return 'DeviceBound';
  }
}

interface AssetState {
  exists: boolean;
}

interface BindingState {
  assetExists: boolean;
  existingBindings: number;
}

function foldAssetState(events: AssetRegistered[]): AssetState {
  return { exists: events.length > 0 };
}

function foldBindingState(
  assetEvents: AssetRegistered[],
  bindingEvents: DeviceBound[],
  assetId: string
): BindingState {
  const assetExists = assetEvents.some(e => e.assetId === assetId);
  const existingBindings = bindingEvents.length;
  
  return { assetExists, existingBindings };
}

function decideAssetRegistration(
  state: AssetState,
  assetId: string,
  name: string
): AssetRegistered[] {
  if (state.exists) {
    throw new Error('AssetAlreadyExists');
  }
  
  return [new AssetRegisteredEvent(assetId, name)];
}

async function executeAssetRegistration(
  store: EventStore,
  assetId: string,
  name: string
): Promise<void> {
  const filter = EventStore
    .createFilter(['AssetRegistered'])
    .withPayloadPredicate('name', name);
  
  const events = await store.queryEvents<AssetRegistered>(filter);
  const state = foldAssetState(events);
  const newEvents = decideAssetRegistration(state, assetId, name);
  
  await store.append(filter, newEvents);
}

async function executeDeviceBinding(
  store: EventStore,
  deviceId: string,
  assetId: string
): Promise<void> {
  const assetFilter = EventStore
    .createFilter(['AssetRegistered'])
    .withPayloadPredicate('assetId', assetId);
  
  const bindingFilter = EventStore
    .createFilter(['DeviceBound'])
    .withPayloadPredicate('assetId', assetId);
  
  const [assetEvents, bindingEvents] = await Promise.all([
    store.queryEvents<AssetRegistered>(assetFilter),
    store.queryEvents<DeviceBound>(bindingFilter)
  ]);
  
  const state = foldBindingState(assetEvents, bindingEvents, assetId);
  
  if (!state.assetExists) {
    throw new Error('AssetNotFound');
  }
  
  const newEvents = [new DeviceBoundEvent(deviceId, assetId)];
  await store.append(bindingFilter, newEvents);
}

export async function runExample(): Promise<void> {
  dotenv.config();

  const store = new EventStore(
    { connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/eventstore' }
  );

  try {
    await store.migrate();
    
    console.log('1. Basic Event Storage and Retrieval');
    const uniqueName = `Asset-${Date.now()}`;
    await executeAssetRegistration(store, 'asset-12345', uniqueName);
    
    const filter = EventStore.createFilter(['AssetRegistered']);
    const storedEvents = await store.queryEvents<AssetRegistered>(filter);
    console.log('Stored events:', storedEvents.length);

    console.log('2. Optimistic Locking Pattern');
    try {
      await executeAssetRegistration(store, 'asset-456', uniqueName);
      console.log('This should fail due to duplicate name');
    } catch (error) {
      console.log('Expected error:', error instanceof Error ? error.message : String(error));
    }

    console.log('3. Cross-Slice Event Consumption');
    await executeDeviceBinding(store, 'device-789', 'asset-123');
    
    const bindingFilter = EventStore.createFilter(['DeviceBound']);
    const bindingEvents = await store.queryEvents<DeviceBound>(bindingFilter);
    console.log('Binding events:', bindingEvents.length);

  } finally {
    await store.close();
  }
}

if (require.main === module) {
  runExample().catch(console.error);
}