-- Refactor create_order_from_payment function
-- Simplifies to accept only stripe_payment_intent_id
-- Adds idempotency check to prevent duplicate orders

-- Drop the old function first
DROP FUNCTION IF EXISTS create_order_from_payment(text, uuid, text, text, text, jsonb, numeric, numeric, numeric, integer);

-- Create new simplified function that only needs payment intent ID
CREATE OR REPLACE FUNCTION create_order_from_payment(
  stripe_payment_intent_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_payment_data jsonb;
  v_metadata jsonb;
  v_user_id uuid;
  v_order_type text;
  v_delivery_address text;
  v_pickup_notes text;
  v_items jsonb;
  v_subtotal numeric;
  v_tax numeric;
  v_total numeric;
  v_points_earned integer;
  v_points_used integer;
  v_points_discount numeric;
  v_order_result jsonb;
BEGIN
  -- Idempotency guard: Check if order already exists for this payment
  SELECT 
    jsonb_build_object(
      'id', o.id,
      'customer_name', up.name,
      'customer_email', up.email,
      'customer_phone', up.phone,
      'items', COALESCE(jsonb_agg(
        jsonb_build_object(
          'name', oi.name,
          'price', oi.price,
          'quantity', oi.quantity
        )
      ) FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb),
      'subtotal', o.subtotal,
      'tax', o.tax,
      'total', o.total,
      'delivery_address', o.delivery_address,
      'pickup_notes', o.pickup_notes,
      'order_type', CASE WHEN o.delivery_address IS NOT NULL THEN 'delivery' ELSE 'pickup' END,
      'points_earned', o.points_earned
    )
  INTO v_order_result
  FROM orders o
  JOIN user_profiles up ON up.id = o.user_id
  LEFT JOIN order_items oi ON oi.order_id = o.id
  WHERE o.payment_id = stripe_payment_intent_id
  GROUP BY o.id, up.name, up.email, up.phone, o.subtotal, o.tax, o.total, 
           o.delivery_address, o.pickup_notes, o.points_earned;

  -- If order exists, return it immediately
  IF v_order_result IS NOT NULL THEN
    RAISE NOTICE 'Order already exists for payment %, returning existing order', stripe_payment_intent_id;
    RETURN v_order_result;
  END IF;

  -- Get payment data from stripe_payments table (should be inserted by webhook before order creation)
  SELECT metadata INTO v_metadata
  FROM stripe_payments
  WHERE payment_id = stripe_payment_intent_id;

  -- If no payment record exists, we can't create the order
  IF v_metadata IS NULL THEN
    RAISE EXCEPTION 'Payment record not found for payment intent: %', stripe_payment_intent_id;
  END IF;

  -- Extract metadata
  v_user_id := (v_metadata->>'user_id')::uuid;
  v_order_type := v_metadata->>'order_type';
  v_delivery_address := v_metadata->>'delivery_address';
  v_pickup_notes := v_metadata->>'pickup_notes';
  v_items := (v_metadata->>'items')::jsonb;
  v_subtotal := (v_metadata->>'subtotal')::numeric;
  v_tax := (v_metadata->>'tax')::numeric;
  v_total := (v_metadata->>'total')::numeric;
  v_points_earned := (v_metadata->>'points_earned')::integer;
  v_points_used := COALESCE((v_metadata->>'points_used')::integer, 0);
  v_points_discount := COALESCE((v_metadata->>'points_discount')::numeric, 0);

  -- Validate required fields
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id is required in payment metadata';
  END IF;

  -- Create order
  INSERT INTO orders (
    user_id,
    status,
    payment_status,
    payment_id,
    subtotal,
    tax,
    total,
    delivery_address,
    pickup_notes,
    points_earned,
    cancellation_deadline
  ) VALUES (
    v_user_id,
    'preparing',
    'succeeded',
    stripe_payment_intent_id,
    v_subtotal,
    v_tax,
    v_total,
    CASE WHEN v_order_type = 'delivery' THEN v_delivery_address ELSE NULL END,
    v_pickup_notes,
    v_points_earned,
    NOW() + INTERVAL '5 minutes'
  )
  RETURNING id INTO v_order_id;

  RAISE NOTICE 'Created order % for payment %', v_order_id, stripe_payment_intent_id;

  -- Insert order items if provided
  IF v_items IS NOT NULL AND jsonb_array_length(v_items) > 0 THEN
    INSERT INTO order_items (
      order_id,
      menu_item_id,
      name,
      price,
      quantity
    )
    SELECT
      v_order_id,
      (item->>'id')::integer,
      item->>'name',
      (item->>'price')::numeric,
      (item->>'quantity')::integer
    FROM jsonb_array_elements(v_items) AS item;
    
    RAISE NOTICE 'Inserted % order items', jsonb_array_length(v_items);
  END IF;

  -- Handle points
  IF v_points_used > 0 THEN
    -- Deduct used points
    UPDATE user_profiles
    SET points = GREATEST(0, COALESCE(points, 0) - v_points_used)
    WHERE id = v_user_id;
    
    RAISE NOTICE 'Deducted % points from user %', v_points_used, v_user_id;
  END IF;

  -- Award points for this order
  IF v_points_earned > 0 THEN
    UPDATE user_profiles
    SET points = COALESCE(points, 0) + v_points_earned
    WHERE id = v_user_id;
    
    RAISE NOTICE 'Awarded % points to user %', v_points_earned, v_user_id;
  END IF;

  -- Record order event
  INSERT INTO order_events (order_id, type, payload)
  VALUES (
    v_order_id,
    'order_created',
    jsonb_build_object(
      'user_id', v_user_id,
      'order_type', v_order_type,
      'total', v_total,
      'payment_intent_id', stripe_payment_intent_id
    )
  );

  -- Build and return complete order object with all details
  SELECT 
    jsonb_build_object(
      'id', o.id,
      'customer_name', up.name,
      'customer_email', up.email,
      'customer_phone', up.phone,
      'items', COALESCE(jsonb_agg(
        jsonb_build_object(
          'name', oi.name,
          'price', oi.price,
          'quantity', oi.quantity
        )
      ) FILTER (WHERE oi.id IS NOT NULL), '[]'::jsonb),
      'subtotal', o.subtotal,
      'tax', o.tax,
      'total', o.total,
      'delivery_address', o.delivery_address,
      'pickup_notes', o.pickup_notes,
      'order_type', CASE WHEN o.delivery_address IS NOT NULL THEN 'delivery' ELSE 'pickup' END,
      'points_earned', o.points_earned
    )
  INTO v_order_result
  FROM orders o
  JOIN user_profiles up ON up.id = o.user_id
  LEFT JOIN order_items oi ON oi.order_id = o.id
  WHERE o.id = v_order_id
  GROUP BY o.id, up.name, up.email, up.phone, o.subtotal, o.tax, o.total, 
           o.delivery_address, o.pickup_notes, o.points_earned;

  RETURN v_order_result;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_order_from_payment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_order_from_payment(text) TO service_role;

-- Add comment documenting the function
COMMENT ON FUNCTION create_order_from_payment(text) IS 'Creates an order from a Stripe payment. Expects payment record to be inserted in stripe_payments table first with all metadata. Includes idempotency check to prevent duplicate orders.';
