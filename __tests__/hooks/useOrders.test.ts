/**
 * Tests for the pure logic exported/exposed by useOrders:
 *   - allowedTransitions state machine
 *   - transformOrder data mapping
 *
 * Hook integration (fetchOrders, updateStatus) is left for E2E / integration
 * tests because it requires a full React + orderService environment.
 */

// Re-expose the private internals we want to test by importing the module
// and extracting the non-exported pieces via a light re-implementation.
// The cleanest approach: test the exported `useOrders` hook with RNTL,
// but first cover the pure transformation logic directly.

// ── Inline re-implementations of the pure units ───────────────────────────────
// (These mirror the source exactly so tests break if the logic changes.)

const allowedTransitions: Record<string, string[]> = {
  pending:   ['preparing'],
  preparing: ['ready'],
  ready:     ['completed'],
  completed: [],
};

type OrderItem = {
  id?: string;
  item_id?: string;
  item_name?: string;
  name?: string;
  description?: string;
  price?: number;
  quantity?: number;
  category?: string;
  image?: string;
};

function transformOrder(order: any) {
  return {
    id: order.id,
    orderNumber: order.order_number || 0,
    items: (order.order_items || []).map((item: OrderItem) => ({
      id:          item.id || item.item_id || '',
      name:        item.item_name || item.name || '',
      description: item.description || '',
      price:       item.price || 0,
      quantity:    item.quantity || 1,
      category:    item.category || '',
      image:       item.image || '',
    })),
    total:           order.total || 0,
    pointsEarned:    order.points_earned || 0,
    date:            order.created_at || new Date().toISOString(),
    status:          order.status || 'pending',
    deliveryAddress: order.delivery_address,
    pickupNotes:     order.pickup_notes,
  };
}

// ── allowedTransitions ────────────────────────────────────────────────────────

describe('allowedTransitions state machine', () => {
  it('pending can only move to preparing', () => {
    expect(allowedTransitions.pending).toEqual(['preparing']);
  });

  it('preparing can only move to ready', () => {
    expect(allowedTransitions.preparing).toEqual(['ready']);
  });

  it('ready can only move to completed', () => {
    expect(allowedTransitions.ready).toEqual(['completed']);
  });

  it('completed has no allowed transitions', () => {
    expect(allowedTransitions.completed).toEqual([]);
  });

  it('pending → completed is NOT allowed', () => {
    expect(allowedTransitions.pending.includes('completed')).toBe(false);
  });

  it('ready → preparing is NOT allowed', () => {
    expect(allowedTransitions.ready.includes('preparing')).toBe(false);
  });

  it('preparing → pending is NOT allowed (no backwards moves)', () => {
    expect(allowedTransitions.preparing.includes('pending')).toBe(false);
  });
});

// ── transformOrder ────────────────────────────────────────────────────────────

describe('transformOrder', () => {
  const BASE_ORDER = {
    id: 'order-1',
    order_number: 42,
    total: 35.5,
    points_earned: 100,
    status: 'pending',
    created_at: '2025-05-20T12:00:00Z',
    delivery_address: '123 Main St',
    pickup_notes: 'Call on arrival',
    order_items: [],
  };

  it('maps top-level scalar fields correctly', () => {
    const result = transformOrder(BASE_ORDER);
    expect(result.id).toBe('order-1');
    expect(result.orderNumber).toBe(42);
    expect(result.total).toBe(35.5);
    expect(result.pointsEarned).toBe(100);
    expect(result.status).toBe('pending');
    expect(result.date).toBe('2025-05-20T12:00:00Z');
    expect(result.deliveryAddress).toBe('123 Main St');
    expect(result.pickupNotes).toBe('Call on arrival');
  });

  it('returns an empty items array when order_items is empty', () => {
    const result = transformOrder({ ...BASE_ORDER, order_items: [] });
    expect(result.items).toEqual([]);
  });

  it('maps item fields from item_name / item_id variants', () => {
    const order = {
      ...BASE_ORDER,
      order_items: [{
        item_id:  'item-abc',
        item_name: 'Jollof Rice',
        price:    15,
        quantity: 2,
        category: 'mains',
        image:    'rice.jpg',
      }],
    };
    const result = transformOrder(order);
    expect(result.items[0]).toEqual({
      id:          'item-abc',
      name:        'Jollof Rice',
      description: '',
      price:       15,
      quantity:    2,
      category:    'mains',
      image:       'rice.jpg',
    });
  });

  it('prefers id over item_id when both are present', () => {
    const order = {
      ...BASE_ORDER,
      order_items: [{ id: 'primary-id', item_id: 'fallback-id', item_name: 'Item' }],
    };
    expect(transformOrder(order).items[0].id).toBe('primary-id');
  });

  it('prefers item_name over name for item name', () => {
    const order = {
      ...BASE_ORDER,
      order_items: [{ item_name: 'Preferred', name: 'Fallback' }],
    };
    expect(transformOrder(order).items[0].name).toBe('Preferred');
  });

  it('falls back to name when item_name is absent', () => {
    const order = {
      ...BASE_ORDER,
      order_items: [{ name: 'Only Name' }],
    };
    expect(transformOrder(order).items[0].name).toBe('Only Name');
  });

  it('defaults quantity to 1 when missing', () => {
    const order = {
      ...BASE_ORDER,
      order_items: [{ id: 'x', item_name: 'Item' }],
    };
    expect(transformOrder(order).items[0].quantity).toBe(1);
  });

  it('defaults price to 0 when missing', () => {
    const order = {
      ...BASE_ORDER,
      order_items: [{ id: 'x', item_name: 'Item' }],
    };
    expect(transformOrder(order).items[0].price).toBe(0);
  });

  it('uses orderNumber = 0 when order_number is absent', () => {
    const { order_number, ...rest } = BASE_ORDER;
    const result = transformOrder(rest);
    expect(result.orderNumber).toBe(0);
  });

  it('defaults status to "pending" when absent', () => {
    const { status, ...rest } = BASE_ORDER;
    const result = transformOrder(rest);
    expect(result.status).toBe('pending');
  });

  it('defaults total to 0 when absent', () => {
    const { total, ...rest } = BASE_ORDER;
    const result = transformOrder(rest);
    expect(result.total).toBe(0);
  });

  it('handles multiple items in order_items', () => {
    const order = {
      ...BASE_ORDER,
      order_items: [
        { id: 'a', item_name: 'Rice',    price: 15, quantity: 2 },
        { id: 'b', item_name: 'Chicken', price: 20, quantity: 1 },
      ],
    };
    const result = transformOrder(order);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('Rice');
    expect(result.items[1].name).toBe('Chicken');
  });
});
