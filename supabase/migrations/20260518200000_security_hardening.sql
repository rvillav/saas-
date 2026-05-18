-- ============================================================
-- Security hardening:
-- 1. FORCE ROW LEVEL SECURITY on all tenant tables
-- 2. Add WITH CHECK to UPDATE policies (prevents org_id hijacking)
-- 3. Add org ownership validation inside SECURITY DEFINER RPCs
-- ============================================================

-- ── 1. Force RLS ─────────────────────────────────────────────
ALTER TABLE public.cash_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_requests FORCE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.quotes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.rentals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sales FORCE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

-- ── 2. Add WITH CHECK to UPDATE policies ─────────────────────

-- cash_periods
DROP POLICY IF EXISTS cash_periods_update ON public.cash_periods;
CREATE POLICY cash_periods_update ON public.cash_periods FOR UPDATE
  USING (organization_id IN (SELECT u.organization_id FROM users u WHERE u.id = (SELECT auth.uid())))
  WITH CHECK (organization_id IN (SELECT u.organization_id FROM users u WHERE u.id = (SELECT auth.uid())));

-- cash_transactions
DROP POLICY IF EXISTS cash_transactions_update ON public.cash_transactions;
CREATE POLICY cash_transactions_update ON public.cash_transactions FOR UPDATE
  USING (organization_id IN (SELECT u.organization_id FROM users u WHERE u.id = (SELECT auth.uid())))
  WITH CHECK (organization_id IN (SELECT u.organization_id FROM users u WHERE u.id = (SELECT auth.uid())));

-- inventory_movements
DROP POLICY IF EXISTS movements_update ON public.inventory_movements;
CREATE POLICY movements_update ON public.inventory_movements FOR UPDATE
  USING ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])))
  WITH CHECK ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])));

-- organizations
DROP POLICY IF EXISTS organizations_update ON public.organizations;
CREATE POLICY organizations_update ON public.organizations FOR UPDATE
  USING (((id = get_user_org_id()) AND (get_user_role() = 'ADMIN'::text)) OR (get_user_role() = 'SUPER_ADMIN'::text))
  WITH CHECK (((id = get_user_org_id()) AND (get_user_role() = 'ADMIN'::text)) OR (get_user_role() = 'SUPER_ADMIN'::text));

-- product_requests
DROP POLICY IF EXISTS product_requests_update ON public.product_requests;
CREATE POLICY product_requests_update ON public.product_requests FOR UPDATE
  USING ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])))
  WITH CHECK ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])));

-- products
DROP POLICY IF EXISTS products_update ON public.products;
CREATE POLICY products_update ON public.products FOR UPDATE
  USING ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])))
  WITH CHECK ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])));

-- quote_items
DROP POLICY IF EXISTS quote_items_update ON public.quote_items;
CREATE POLICY quote_items_update ON public.quote_items FOR UPDATE
  USING ((quote_id IN (SELECT q.id FROM quotes q WHERE q.organization_id = get_user_org_id())) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])))
  WITH CHECK ((quote_id IN (SELECT q.id FROM quotes q WHERE q.organization_id = get_user_org_id())) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])));

-- quotes
DROP POLICY IF EXISTS quotes_update ON public.quotes;
CREATE POLICY quotes_update ON public.quotes FOR UPDATE
  USING ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])))
  WITH CHECK ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])));

-- rentals
DROP POLICY IF EXISTS rentals_update ON public.rentals;
CREATE POLICY rentals_update ON public.rentals FOR UPDATE
  USING ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])))
  WITH CHECK ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])));

-- sale_items
DROP POLICY IF EXISTS sale_items_update ON public.sale_items;
CREATE POLICY sale_items_update ON public.sale_items FOR UPDATE
  USING ((sale_id IN (SELECT s.id FROM (sales s JOIN users u ON (u.organization_id = s.organization_id)) WHERE (u.id = (SELECT auth.uid())))) AND (get_user_role() = 'ADMIN'::text))
  WITH CHECK ((sale_id IN (SELECT s.id FROM (sales s JOIN users u ON (u.organization_id = s.organization_id)) WHERE (u.id = (SELECT auth.uid())))) AND (get_user_role() = 'ADMIN'::text));

-- sales
DROP POLICY IF EXISTS sales_update ON public.sales;
CREATE POLICY sales_update ON public.sales FOR UPDATE
  USING ((organization_id IN (SELECT users.organization_id FROM users WHERE (users.id = (SELECT auth.uid())))) AND (get_user_role() = 'ADMIN'::text))
  WITH CHECK ((organization_id IN (SELECT users.organization_id FROM users WHERE (users.id = (SELECT auth.uid())))) AND (get_user_role() = 'ADMIN'::text));

-- ── 3. Fix SECURITY DEFINER RPCs — add org ownership check ───

CREATE OR REPLACE FUNCTION public.create_sale(
  p_org_id uuid,
  p_client_name text,
  p_client_rut text DEFAULT NULL::text,
  p_client_email text DEFAULT NULL::text,
  p_client_phone text DEFAULT NULL::text,
  p_payment_method text DEFAULT 'CASH'::text,
  p_notes text DEFAULT NULL::text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_sale_number int;
  v_item jsonb;
  v_stock int;
  v_total numeric := 0;
  v_subtotal numeric;
  v_tax numeric;
  v_pm_label text;
BEGIN
  -- Validate org ownership — prevents IDOR when called from client
  IF p_org_id IS DISTINCT FROM get_user_org_id() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta debe tener al menos un producto.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_total := v_total + (v_item->>'quantity')::int * (v_item->>'unit_price')::numeric;
  END LOOP;

  v_subtotal := ROUND(v_total / 1.19);
  v_tax := v_total - v_subtotal;

  INSERT INTO sales (
    organization_id, client_name, client_rut, client_email, client_phone,
    payment_method, notes, subtotal, tax_amount, total_amount, status
  ) VALUES (
    p_org_id, p_client_name, p_client_rut, p_client_email, p_client_phone,
    p_payment_method, p_notes, v_subtotal, v_tax, v_total, 'COMPLETED'
  ) RETURNING id, sale_number INTO v_sale_id, v_sale_number;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT current_stock INTO v_stock
    FROM products
    WHERE id = (v_item->>'product_id')::uuid
    FOR UPDATE;

    IF v_stock IS NULL THEN
      RAISE EXCEPTION 'Producto no encontrado: %', (v_item->>'product_id');
    END IF;

    IF v_stock < (v_item->>'quantity')::int THEN
      RAISE EXCEPTION 'Stock insuficiente para producto %. Disponible: %, Solicitado: %',
        (v_item->>'product_id'), v_stock, (v_item->>'quantity');
    END IF;

    UPDATE products
    SET current_stock = current_stock - (v_item->>'quantity')::int
    WHERE id = (v_item->>'product_id')::uuid;

    INSERT INTO sale_items (sale_id, product_id, quantity, unit_price)
    VALUES (
      v_sale_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'quantity')::int,
      (v_item->>'unit_price')::numeric
    );

    INSERT INTO inventory_movements (organization_id, product_id, type, quantity, user_id, notes)
    VALUES (
      p_org_id,
      (v_item->>'product_id')::uuid,
      'OUT',
      (v_item->>'quantity')::int,
      p_user_id,
      'Venta N° ' || LPAD(v_sale_number::text, 4, '0') || ' — ' || p_client_name
    );
  END LOOP;

  v_pm_label := CASE p_payment_method
    WHEN 'CASH' THEN 'Efectivo'
    WHEN 'TRANSFER' THEN 'Transferencia'
    WHEN 'CARD' THEN 'Tarjeta'
    WHEN 'CHECK' THEN 'Cheque'
    ELSE p_payment_method
  END;

  INSERT INTO cash_transactions (
    organization_id, type, category, amount, description,
    reference_type, reference_id, transaction_date, created_by
  ) VALUES (
    p_org_id, 'INCOME', 'VENTA', v_total,
    'Venta N° ' || LPAD(v_sale_number::text, 4, '0') || ' a ' || p_client_name || ' — ' || v_pm_label,
    'SALE', v_sale_id, CURRENT_DATE, p_user_id
  );

  RETURN jsonb_build_object(
    'sale_id', v_sale_id,
    'sale_number', v_sale_number,
    'total_amount', v_total
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_sale(
  p_sale_id uuid,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_item record;
  v_org_id uuid;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada.';
  END IF;

  -- Validate org ownership
  IF v_sale.organization_id IS DISTINCT FROM get_user_org_id() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_org_id := v_sale.organization_id;

  FOR v_item IN
    SELECT product_id, quantity FROM public.sale_items WHERE sale_id = p_sale_id
  LOOP
    UPDATE public.products
    SET current_stock = current_stock + v_item.quantity
    WHERE id = v_item.product_id;

    INSERT INTO public.inventory_movements (organization_id, product_id, type, quantity, user_id, notes)
    VALUES (
      v_org_id,
      v_item.product_id,
      'IN',
      v_item.quantity,
      p_user_id,
      'Reversión por venta eliminada (N° ' || LPAD(v_sale.sale_number::text, 4, '0') || ') — Cliente: ' || v_sale.client_name
    );
  END LOOP;

  DELETE FROM public.sales WHERE id = p_sale_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_rental(
  p_org_id uuid,
  p_product_id uuid,
  p_client_name text,
  p_client_rut text DEFAULT NULL::text,
  p_client_phone text DEFAULT NULL::text,
  p_client_email text DEFAULT NULL::text,
  p_quantity integer DEFAULT 1,
  p_daily_rate numeric DEFAULT 0,
  p_start_date date DEFAULT CURRENT_DATE,
  p_expected_return_date date DEFAULT NULL::date,
  p_notes text DEFAULT NULL::text,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock int;
  v_rental_id uuid;
BEGIN
  -- Validate org ownership
  IF p_org_id IS DISTINCT FROM get_user_org_id() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_quantity < 1 THEN
    RAISE EXCEPTION 'La cantidad debe ser al menos 1.';
  END IF;

  SELECT current_stock INTO v_stock
  FROM products
  WHERE id = p_product_id
  FOR UPDATE;

  IF v_stock IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado.';
  END IF;

  IF v_stock < p_quantity THEN
    RAISE EXCEPTION 'Stock insuficiente. Disponible: %, Solicitado: %', v_stock, p_quantity;
  END IF;

  UPDATE products
  SET current_stock = current_stock - p_quantity
  WHERE id = p_product_id;

  INSERT INTO rentals (
    organization_id, product_id, client_name, client_rut,
    client_phone, client_email, quantity, daily_rate,
    start_date, expected_return_date, notes, status
  ) VALUES (
    p_org_id, p_product_id, p_client_name, p_client_rut,
    p_client_phone, p_client_email, p_quantity, p_daily_rate,
    p_start_date, p_expected_return_date, p_notes, 'ACTIVE'
  ) RETURNING id INTO v_rental_id;

  INSERT INTO inventory_movements (organization_id, product_id, type, quantity, user_id, notes)
  VALUES (
    p_org_id, p_product_id, 'OUT', p_quantity, p_user_id,
    'Arriendo a ' || p_client_name
  );

  RETURN v_rental_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.return_rental(
  p_rental_id uuid,
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rental rentals%ROWTYPE;
  v_product_name text;
  v_days int;
  v_total numeric;
  v_org_id uuid;
BEGIN
  SELECT * INTO v_rental
  FROM rentals
  WHERE id = p_rental_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Arriendo no encontrado.';
  END IF;

  -- Validate org ownership
  IF v_rental.organization_id IS DISTINCT FROM get_user_org_id() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF v_rental.status <> 'ACTIVE' AND v_rental.status <> 'OVERDUE' THEN
    RAISE EXCEPTION 'Este arriendo no se puede devolver (estado: %).', v_rental.status;
  END IF;

  v_org_id := v_rental.organization_id;

  UPDATE rentals
  SET status = 'RETURNED',
      actual_return_date = CURRENT_DATE,
      updated_at = now()
  WHERE id = p_rental_id;

  UPDATE products
  SET current_stock = current_stock + v_rental.quantity
  WHERE id = v_rental.product_id;

  SELECT name INTO v_product_name FROM products WHERE id = v_rental.product_id;

  INSERT INTO inventory_movements (organization_id, product_id, type, quantity, user_id, notes)
  VALUES (
    v_org_id, v_rental.product_id, 'IN', v_rental.quantity, p_user_id,
    'Devolución arriendo de ' || v_rental.client_name
  );

  v_days := GREATEST(1, CURRENT_DATE - v_rental.start_date);
  v_total := v_days * v_rental.daily_rate * v_rental.quantity;

  INSERT INTO cash_transactions (
    organization_id, type, category, amount, description,
    reference_type, reference_id, transaction_date, created_by
  ) VALUES (
    v_org_id, 'INCOME', 'ARRIENDO', v_total,
    'Arriendo devuelto — ' || v_rental.client_name || ' (' || COALESCE(v_product_name, 'Equipo') || ', ' || v_days || ' días)',
    'RENTAL', p_rental_id, CURRENT_DATE, p_user_id
  );

  RETURN jsonb_build_object(
    'rental_id', p_rental_id,
    'days', v_days,
    'total', v_total
  );
END;
$$;
