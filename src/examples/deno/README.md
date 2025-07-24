# Deno EventStore Examples 

These examples demonstrate proper event modeling and domain-driven design patterns using the EventStore library with Deno.

## 🚀 Quick Start

### Prerequisites

1. **Deno**: Install from [deno.land](https://deno.land/)
2. **PostgreSQL**: Ensure PostgreSQL is running locally or accessible remotely
3. **Database URL**: Set the `DATABASE_URL` environment variable

```bash
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/eventstore_demo"
```

### Running Examples

```bash
deno run --allow-net --allow-env src/examples/deno/order-fulfillment.ts

```

## Examples Overview

### Order Fulfillment (`order-fulfillment.ts`)  
- 🛒 **OrderPlaced**: Customer places an order
- 💳 **PaymentAuthorized**: Payment is processed
- 📦 **InventoryReserved**: Items are allocated
- 🚚 **OrderShipped**: Package is dispatched
- 🏠 **OrderDelivered**: Customer receives order
- ❌ **OrderCancelled**: Order is cancelled with refund
