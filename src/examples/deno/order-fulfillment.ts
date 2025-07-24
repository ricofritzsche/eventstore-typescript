#!/usr/bin/env -S deno run --allow-net --allow-env

/**
 * Order Fulfillment Domain Example
 * 
 * This example shows proper event modeling for an e-commerce order lifecycle.
 * Events represent state transitions and business processes, not just data changes.
 * 
 * Run with: deno run --allow-net --allow-env src/examples/deno/order-fulfillment.ts
 */

import { PostgresEventStore, createFilter, Event } from '../../../mod.ts';

// Domain Events for Order Lifecycle
interface OrderPlaced {
  orderId: string;
  customerId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
  }>;
  totalAmount: number;
  placedAt: string;
}

interface PaymentAuthorized {
  orderId: string;
  paymentId: string;
  amount: number;
  paymentMethod: string;
  authorizedAt: string;
}

interface InventoryReserved {
  orderId: string;
  reservations: Array<{
    productId: string;
    quantity: number;
    warehouseId: string;
  }>;
  reservedAt: string;
}

interface OrderShipped {
  orderId: string;
  trackingNumber: string;
  carrier: string;
  estimatedDelivery: string;
  shippedAt: string;
}

interface OrderDelivered {
  orderId: string;
  deliveredAt: string;
  signedBy?: string;
}

interface OrderCancelled {
  orderId: string;
  reason: string;
  cancelledAt: string;
  refundId?: string;
}

async function demonstrateOrderLifecycle() {
  console.log('🦕 Order Fulfillment Domain Events Example');
  console.log('==========================================');
  
  const store = new PostgresEventStore({
    connectionString: Deno.env.get('DATABASE_URL') || 'postgres://user:pass@localhost:5432/eventstore_deno_demo'
  });

  try {
    console.log('📦 Initializing event store...');
    await store.initializeDatabase();
    
    const orderId = `order_${crypto.randomUUID().slice(0, 8)}`;
    const customerId = `cust_${crypto.randomUUID().slice(0, 8)}`;
    
    // Successful Order Flow
    console.log('\n🛒 Simulating successful order flow...');
    
    const orderEvents: Event[] = [
      {
        eventType: 'OrderPlaced',
        payload: {
          orderId,
          customerId,
          items: [
            { productId: 'laptop_001', quantity: 1, unitPrice: 1299.99 },
            { productId: 'mouse_002', quantity: 2, unitPrice: 29.99 }
          ],
          totalAmount: 1359.97,
          placedAt: new Date().toISOString()
        } as OrderPlaced
      },
      {
        eventType: 'PaymentAuthorized',
        payload: {
          orderId,
          paymentId: `pay_${crypto.randomUUID().slice(0, 8)}`,
          amount: 1359.97,
          paymentMethod: 'credit_card',
          authorizedAt: new Date().toISOString()
        } as PaymentAuthorized
      },
      {
        eventType: 'InventoryReserved',
        payload: {
          orderId,
          reservations: [
            { productId: 'laptop_001', quantity: 1, warehouseId: 'wh_east' },
            { productId: 'mouse_002', quantity: 2, warehouseId: 'wh_east' }
          ],
          reservedAt: new Date().toISOString()
        } as InventoryReserved
      }
    ];

    console.log('💾 Processing order placement...');
    await store.append(orderEvents);
    
    // Simulate fulfillment process
    setTimeout(async () => {
      const fulfillmentEvents: Event[] = [
        {
          eventType: 'OrderShipped',
          payload: {
            orderId,
            trackingNumber: 'TRK' + Math.random().toString(36).substr(2, 9).toUpperCase(),
            carrier: 'UPS',
            estimatedDelivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            shippedAt: new Date().toISOString()
          } as OrderShipped
        }
      ];

      await store.append(fulfillmentEvents);
      console.log('📦 Order shipped!');
      
      // Simulate delivery
      setTimeout(async () => {
        const deliveryEvents: Event[] = [
          {
            eventType: 'OrderDelivered',
            payload: {
              orderId,
              deliveredAt: new Date().toISOString(),
              signedBy: 'Customer'
            } as OrderDelivered
          }
        ];

        await store.append(deliveryEvents);
        console.log('🏠 Order delivered!');
        
        // Query complete order history
        await showOrderHistory(store, orderId);
        
      }, 1500);
      
    }, 1000);

    // Simulate a cancelled order in parallel
    setTimeout(async () => {
      const cancelledOrderId = `order_${crypto.randomUUID().slice(0, 8)}`;
      
      console.log('\n❌ Simulating cancelled order flow...');
      
      const cancelledOrderEvents: Event[] = [
        {
          eventType: 'OrderPlaced',
          payload: {
            orderId: cancelledOrderId,
            customerId: 'cust_different',
            items: [{ productId: 'headphones_003', quantity: 1, unitPrice: 199.99 }],
            totalAmount: 199.99,
            placedAt: new Date().toISOString()
          } as OrderPlaced
        },
        {
          eventType: 'OrderCancelled',
          payload: {
            orderId: cancelledOrderId,
            reason: 'Customer requested cancellation',
            cancelledAt: new Date().toISOString(),
            refundId: `ref_${crypto.randomUUID().slice(0, 8)}`
          } as OrderCancelled
        }
      ];

      await store.append(cancelledOrderEvents);
      console.log('🚫 Order cancelled with refund issued');
      
    }, 2000);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('💡 Make sure PostgreSQL is running and DATABASE_URL is set');
    await store.close();
  }
}

async function showOrderHistory(store: PostgresEventStore, orderId: string) {
  console.log('\n📊 Complete Order Timeline:');
  console.log('===========================');
  
  const orderFilter = createFilter([
    'OrderPlaced', 'PaymentAuthorized', 'InventoryReserved', 
    'OrderShipped', 'OrderDelivered', 'OrderCancelled'
  ]);
  
  const result = await store.query(orderFilter);
  
  // Filter events for this specific order and sort by timestamp
  const orderEvents = result.events
    .filter(event => (event.payload as any).orderId === orderId)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  orderEvents.forEach((event, i) => {
    const timestamp = new Date(event.timestamp).toLocaleString();
    const payload = event.payload as any;
    
    console.log(`${i + 1}. ${timestamp} - ${event.eventType}`);
    
    switch (event.eventType) {
      case 'OrderPlaced':
        console.log(`   💰 Total: $${payload.totalAmount} (${payload.items.length} items)`);
        break;
      case 'PaymentAuthorized':
        console.log(`   💳 Payment: $${payload.amount} via ${payload.paymentMethod}`);
        break;
      case 'InventoryReserved':
        console.log(`   📦 Reserved ${payload.reservations.length} item types`);
        break;
      case 'OrderShipped':
        console.log(`   🚚 Tracking: ${payload.trackingNumber} (${payload.carrier})`);
        break;
      case 'OrderDelivered':
        console.log(`   🏠 Delivered to: ${payload.signedBy || 'Customer'}`);
        break;
    }
  });
  
  console.log('\n✨ Event-driven architecture benefits:');
  console.log('  • Complete audit trail of business processes');
  console.log('  • Each event represents a meaningful business occurrence');
  console.log('  • Easy to add new event types without changing existing code');
  console.log('  • Can rebuild state at any point in time');
  
  await store.close();
}

if (import.meta.main) {
  demonstrateOrderLifecycle();
}