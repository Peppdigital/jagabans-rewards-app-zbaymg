-- Refactor create_order_from_payment to use verified cents from pending_orders
-- and server-side points calculation, with customer_name and order_type stored
-- directly on the orders table. Rewrites authorization to use user_profiles.user_id
-- (the actual PK) instead of user_profiles.id.

CREATE OR REPLACE FUNCTION create_order_from_payment(
  stripe_payment_intent_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id            uuid;
  v_order_number        integer;
  v_metadata            jsonb;
  v_user_id             uuid;
  v_order_type          text;
  v_delivery_address    text;
  v_pickup_notes        text;
  v_items               jsonb;
  v_customer_name       text;
  -- ── Verified cents (authoritative — written by create-payment-intent) ──────
  v_subtotal_cents      bigint;
  v_discount_cents      bigint;
  v_tax_cents           bigint;
  v_delivery_fee_cents  bigint;
  v_total_cents         bigint;
  -- ── Dollar amounts derived from cents (used in INSERT) ────────────────────
  v_subtotal            numeric;
  v_discount            numeric;
  v_tax                 numeric;
  v_delivery_fee        numeric;
  v_total               numeric;
  -- ── Points / loyalty ──────────────────────────────────────────────────────
  v_points_earned       integer;
  v_points_used         integer;
  v_points_discount     numeric;
  -- ── Misc ──────────────────────────────────────────────────────────────────
  v_pending_order_id    uuid;
  v_order_result        jsonb;

BEGIN

  -- ── Idempotency guard ────────────────────────────────────────────────────────
  -- If an order already exists for this payment intent, return it immediately
  -- without touching anything else.

  SELECT
    jsonb_build_object(
      'id',               o.id,
      'order_number',     o.order_number,
      'user_id',          o.user_id,
      'customer_name',    up.name,
      'customer_email',   up.email,
      'customer_phone',   up.phone,
      'items',            COALESCE(
                            jsonb_agg(
                              jsonb_build_object(
                                'name',     oi.name,
                                'price',    oi.price,
                                'quantity', oi.quantity
                              )
                            ) FILTER (WHERE oi.id IS NOT NULL),
                            '[]'::jsonb
                          ),
      'subtotal',         o.subtotal,
      'discount',         o.discount,
      'tax',              o.tax,
      'delivery_fee',     o.delivery_fee,
      'total',            o.total,
      'delivery_address', o.delivery_address,
      'pickup_notes',     o.pickup_notes,
      'order_type',       o.order_type,
      'points_earned',    o.points_earned
    )
  INTO v_order_result
  FROM orders o
  JOIN user_profiles up ON up.user_id = o.user_id
  LEFT JOIN order_items oi ON oi.order_id = o.id
  WHERE o.payment_id = stripe_payment_intent_id
  GROUP BY
    o.id, o.order_number, o.user_id,
    up.name, up.email, up.phone,
    o.subtotal, o.discount, o.tax, o.delivery_fee, o.total,
    o.delivery_address, o.pickup_notes, o.order_type, o.points_earned;

  IF v_order_result IS NOT NULL THEN
    RAISE NOTICE 'Order already exists for payment %, returning existing', stripe_payment_intent_id;
    RETURN v_order_result;
  END IF;

  -- ── 1. Resolve user_id and pending_order_id from stripe_payments ─────────────

  SELECT
    (metadata->>'user_id')::uuid,
    (metadata->>'pending_order_id')::uuid
  INTO v_user_id, v_pending_order_id
  FROM stripe_payments
  WHERE payment_id = stripe_payment_intent_id;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for payment intent: %', stripe_payment_intent_id;
  END IF;

  IF v_pending_order_id IS NULL THEN
    RAISE EXCEPTION 'pending_order_id missing from payment metadata for: %', stripe_payment_intent_id;
  END IF;

  -- ── 2. Load pending order: payload + verified financial snapshot ──────────────

  SELECT
    payload,
    verified_subtotal_cents,
    verified_discount_cents,
    verified_tax_cents,
    verified_delivery_fee_cents,
    verified_total_cents
  INTO
    v_metadata,
    v_subtotal_cents,
    v_discount_cents,
    v_tax_cents,
    v_delivery_fee_cents,
    v_total_cents
  FROM pending_orders
  WHERE id       = v_pending_order_id
    AND user_id  = v_user_id;

  IF v_metadata IS NULL THEN
    RAISE EXCEPTION 'Pending order % not found (or user mismatch)', v_pending_order_id;
  END IF;

  -- ── 3. Extract non-financial fields from payload ──────────────────────────────

  v_order_type       := v_metadata->>'order_type';
  v_delivery_address := v_metadata->>'delivery_address';
  v_pickup_notes     := v_metadata->>'pickup_notes';
  v_items            := COALESCE((v_metadata->>'items')::jsonb, v_metadata->'items');
  v_customer_name    := v_metadata->>'customer_name';
  v_points_used      := COALESCE((v_metadata->>'points_used')::integer, 0);
  v_points_discount  := COALESCE((v_metadata->>'points_discount')::numeric, 0);

  -- ── 4. Convert verified cents to dollars for DB insert ───────────────────────

  v_subtotal     := ROUND(v_subtotal_cents     / 100.0, 2);
  v_discount     := ROUND(v_discount_cents     / 100.0, 2);
  v_tax          := ROUND(v_tax_cents          / 100.0, 2);
  v_delivery_fee := ROUND(v_delivery_fee_cents / 100.0, 2);
  v_total        := ROUND(v_total_cents        / 100.0, 2);

  -- ── 5. Compute loyalty points from verified discounted subtotal ───────────────

  v_points_earned := FLOOR((v_subtotal_cents - v_discount_cents) / 100);

  -- ── 6. Create order ───────────────────────────────────────────────────────────

  INSERT INTO orders (
    user_id, status, payment_status, payment_id,
    subtotal, discount, tax, delivery_fee, total,
    delivery_address, pickup_notes,
    points_earned,
    cancellation_deadline,
    order_type, customer_name
  ) VALUES (
    v_user_id,
    'preparing',
    'succeeded',
    stripe_payment_intent_id,
    v_subtotal, v_discount, v_tax, v_delivery_fee, v_total,
    CASE WHEN v_order_type = 'delivery' THEN v_delivery_address ELSE NULL END,
    v_pickup_notes,
    v_points_earned,
    NOW() + INTERVAL '5 minutes',
    v_order_type,
    v_customer_name
  )
  RETURNING id, order_number INTO v_order_id, v_order_number;

  RAISE NOTICE 'Created order % (#%) for payment %', v_order_id, v_order_number, stripe_payment_intent_id;

  -- ── 7. Insert order items ─────────────────────────────────────────────────────

  IF v_items IS NOT NULL AND jsonb_array_length(v_items) > 0 THEN
    INSERT INTO order_items (order_id, menu_item_id, name, price, quantity)
    SELECT
      v_order_id,
      NULLIF(item->>'id', '')::integer,
      item->>'name',
      (item->>'price')::numeric,
      (item->>'quantity')::integer
    FROM jsonb_array_elements(v_items) AS item;

    RAISE NOTICE 'Inserted % order items', jsonb_array_length(v_items);
  END IF;

  -- ── 8. Handle loyalty points ──────────────────────────────────────────────────

  IF v_points_used > 0 THEN
    UPDATE user_profiles
    SET points = GREATEST(0, COALESCE(points, 0) - v_points_used)
    WHERE user_id = v_user_id;
  END IF;

  IF v_points_earned > 0 THEN
    UPDATE user_profiles
    SET points = COALESCE(points, 0) + v_points_earned
    WHERE user_id = v_user_id;
  END IF;

  -- ── 9. Order event ────────────────────────────────────────────────────────────

  INSERT INTO order_events (order_id, type, payload)
  VALUES (
    v_order_id,
    'order_created',
    jsonb_build_object(
      'user_id',            v_user_id,
      'order_type',         v_order_type,
      'subtotal',           v_subtotal,
      'discount',           v_discount,
      'tax',                v_tax,
      'delivery_fee',       v_delivery_fee,
      'total',              v_total,
      'points_earned',      v_points_earned,
      'payment_intent_id',  stripe_payment_intent_id
    )
  );

  -- ── 10. Mark pending order as processed ──────────────────────────────────────

  UPDATE pending_orders
  SET processed_at = NOW()
  WHERE id = v_pending_order_id;

  RAISE NOTICE 'Marked pending order % as processed', v_pending_order_id;

  -- ── 11. Return complete order ─────────────────────────────────────────────────

  SELECT
    jsonb_build_object(
      'id',               o.id,
      'order_number',     o.order_number,
      'user_id',          o.user_id,
      'customer_name',    up.name,
      'customer_email',   up.email,
      'customer_phone',   up.phone,
      'items',            COALESCE(
                            jsonb_agg(
                              jsonb_build_object(
                                'name',     oi.name,
                                'price',    oi.price,
                                'quantity', oi.quantity
                              )
                            ) FILTER (WHERE oi.id IS NOT NULL),
                            '[]'::jsonb
                          ),
      'subtotal',         o.subtotal,
      'discount',         o.discount,
      'tax',              o.tax,
      'delivery_fee',     o.delivery_fee,
      'total',            o.total,
      'delivery_address', o.delivery_address,
      'pickup_notes',     o.pickup_notes,
      'order_type',       o.order_type,
      'points_earned',    o.points_earned
    )
  INTO v_order_result
  FROM orders o
  JOIN user_profiles up ON up.user_id = o.user_id
  LEFT JOIN order_items oi ON oi.order_id = o.id
  WHERE o.id = v_order_id
  GROUP BY
    o.id, o.order_number, o.user_id,
    up.name, up.email, up.phone,
    o.subtotal, o.discount, o.tax, o.delivery_fee, o.total,
    o.delivery_address, o.pickup_notes, o.order_type, o.points_earned;

  RETURN v_order_result;

END;
$$;

-- Preserve existing grants
GRANT EXECUTE ON FUNCTION create_order_from_payment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_order_from_payment(text) TO service_role;

COMMENT ON FUNCTION create_order_from_payment(text) IS 'Creates an order from a Stripe payment using authoritative verified cents from pending_orders. Points computed server-side from discounted subtotal. Includes idempotency guard.';
