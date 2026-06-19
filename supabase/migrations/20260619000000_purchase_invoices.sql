-- ============================================================
-- Purchase Invoices Module:
-- 1. Add purchase_price column to products
-- 2. Create purchase_invoices table
-- 3. Create purchase_invoice_items table
-- 4. Configure RLS on both tables
-- 5. Define create_purchase_invoice RPC
-- 6. Define cancel_purchase_invoice RPC
-- ============================================================

-- ── 1. Add purchase_price to products ─────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS purchase_price numeric DEFAULT NULL;

-- ── 2. Create purchase_invoices table ─────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_invoices (
  id                uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id   uuid    NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_number    text    NOT NULL,
  supplier_name     text    NOT NULL,
  supplier_rut      text    DEFAULT NULL::text,
  purchase_date     date    NOT NULL DEFAULT CURRENT_DATE,
  subtotal          numeric NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount        numeric NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount      numeric NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  status            text    NOT NULL DEFAULT 'CONFIRMED'
                            CHECK (status IN ('CONFIRMED', 'CANCELLED')),
  notes             text    DEFAULT NULL::text,
  created_by        uuid    DEFAULT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at        timestamp with time zone DEFAULT now() NOT NULL,
  updated_at        timestamp with time zone DEFAULT now() NOT NULL
);

-- ── 3. Create purchase_invoice_items table ────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_invoice_items (
  id                    uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_invoice_id   uuid    NOT NULL
                                REFERENCES public.purchase_invoices(id) ON DELETE CASCADE,
  product_id            uuid    NOT NULL
                                REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity              integer NOT NULL CHECK (quantity > 0),
  unit_purchase_price   numeric NOT NULL CHECK (unit_purchase_price >= 0),
  created_at            timestamp with time zone DEFAULT now() NOT NULL
);

-- ── 4. Enable RLS and Policies ────────────────────────────────

-- purchase_invoices
ALTER TABLE public.purchase_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_invoices_select ON public.purchase_invoices;
CREATE POLICY purchase_invoices_select ON public.purchase_invoices FOR SELECT
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS purchase_invoices_insert ON public.purchase_invoices;
CREATE POLICY purchase_invoices_insert ON public.purchase_invoices FOR INSERT
  WITH CHECK (
    (organization_id = get_user_org_id()) AND
    (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text]))
  );

DROP POLICY IF EXISTS purchase_invoices_update ON public.purchase_invoices;
CREATE POLICY purchase_invoices_update ON public.purchase_invoices FOR UPDATE
  USING ((organization_id = get_user_org_id()) AND (get_user_role() = 'ADMIN'::text))
  WITH CHECK ((organization_id = get_user_org_id()) AND (get_user_role() = 'ADMIN'::text));

DROP POLICY IF EXISTS purchase_invoices_delete ON public.purchase_invoices;
CREATE POLICY purchase_invoices_delete ON public.purchase_invoices FOR DELETE
  USING ((organization_id = get_user_org_id()) AND (get_user_role() = 'ADMIN'::text));

-- purchase_invoice_items (acceso via factura padre)
ALTER TABLE public.purchase_invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_invoice_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS purchase_invoice_items_select ON public.purchase_invoice_items;
CREATE POLICY purchase_invoice_items_select ON public.purchase_invoice_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_invoices pi
      WHERE pi.id = purchase_invoice_id
        AND pi.organization_id = get_user_org_id()
    )
  );

-- ── 5. RPC: create_purchase_invoice ───────────────────────────
-- Crea la factura, registra ítems, incrementa stock y genera movimientos IN.
-- Cada precio unitario debe ser el precio de compra IVA incluido.
CREATE OR REPLACE FUNCTION public.create_purchase_invoice(
  p_org_id          uuid,
  p_invoice_number  text,
  p_supplier_name   text,
  p_supplier_rut    text    DEFAULT NULL::text,
  p_purchase_date   date    DEFAULT CURRENT_DATE,
  p_notes           text    DEFAULT NULL::text,
  p_user_id         uuid    DEFAULT NULL::uuid,
  p_items           jsonb   DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id    uuid;
  v_item          jsonb;
  v_product_id    uuid;
  v_quantity      integer;
  v_unit_price    numeric;
  v_total         numeric := 0;
  v_subtotal      numeric;
  v_tax           numeric;
BEGIN
  -- Validate org membership
  IF p_org_id IS DISTINCT FROM get_user_org_id() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La factura debe tener al menos un ítem.';
  END IF;

  -- Validate items and accumulate total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_purchase_price')::numeric;

    IF v_quantity < 1 THEN
      RAISE EXCEPTION 'La cantidad debe ser al menos 1.';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM products
      WHERE id = v_product_id AND organization_id = p_org_id
    ) THEN
      RAISE EXCEPTION 'Producto no encontrado o no pertenece a la organización.';
    END IF;

    v_total := v_total + (v_quantity * v_unit_price);
  END LOOP;

  -- IVA breakdown: precios son IVA incluido → neto = total / 1.19
  v_subtotal := round(v_total / 1.19, 0);
  v_tax      := v_total - v_subtotal;

  -- Insert invoice header
  INSERT INTO purchase_invoices (
    organization_id, invoice_number, supplier_name, supplier_rut,
    purchase_date, subtotal, tax_amount, total_amount, notes, created_by
  )
  VALUES (
    p_org_id, p_invoice_number, p_supplier_name, p_supplier_rut,
    p_purchase_date, v_subtotal, v_tax, v_total, p_notes, p_user_id
  )
  RETURNING id INTO v_invoice_id;

  -- Process each item
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity   := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_purchase_price')::numeric;

    -- Insert item record
    INSERT INTO purchase_invoice_items (
      purchase_invoice_id, product_id, quantity, unit_purchase_price
    )
    VALUES (v_invoice_id, v_product_id, v_quantity, v_unit_price);

    -- Increment stock
    UPDATE products
    SET current_stock  = current_stock + v_quantity,
        purchase_price = v_unit_price,
        updated_at     = now()
    WHERE id = v_product_id AND organization_id = p_org_id;

    -- Record inventory movement for traceability
    INSERT INTO inventory_movements (
      organization_id, product_id, type, quantity, user_id, notes
    )
    VALUES (
      p_org_id, v_product_id, 'IN', v_quantity, p_user_id,
      'Factura de compra N° ' || p_invoice_number || ' — ' || p_supplier_name
    );
  END LOOP;

  RETURN v_invoice_id;
END;
$$;

-- ── 6. RPC: cancel_purchase_invoice ───────────────────────────
-- Cancela la factura y revierte el stock incrementado.
-- Si el stock actual no alcanza, lanza excepción.
CREATE OR REPLACE FUNCTION public.cancel_purchase_invoice(
  p_invoice_id uuid,
  p_user_id    uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice   purchase_invoices%ROWTYPE;
  v_item      purchase_invoice_items%ROWTYPE;
  v_stock     integer;
BEGIN
  SELECT * INTO v_invoice
  FROM purchase_invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Factura no encontrada.';
  END IF;

  IF v_invoice.organization_id IS DISTINCT FROM get_user_org_id() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF v_invoice.status <> 'CONFIRMED' THEN
    RAISE EXCEPTION 'Solo se pueden anular facturas confirmadas (estado actual: %).', v_invoice.status;
  END IF;

  -- Validate sufficient stock before reversing
  FOR v_item IN
    SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id
  LOOP
    SELECT current_stock INTO v_stock
    FROM products WHERE id = v_item.product_id FOR UPDATE;

    IF v_stock < v_item.quantity THEN
      RAISE EXCEPTION
        'No se puede anular: stock insuficiente para revertir el ítem (disponible: %, requerido: %).',
        v_stock, v_item.quantity;
    END IF;
  END LOOP;

  -- Reverse stock and record movements
  FOR v_item IN
    SELECT * FROM purchase_invoice_items WHERE purchase_invoice_id = p_invoice_id
  LOOP
    UPDATE products
    SET current_stock = current_stock - v_item.quantity,
        updated_at    = now()
    WHERE id = v_item.product_id AND organization_id = v_invoice.organization_id;

    INSERT INTO inventory_movements (
      organization_id, product_id, type, quantity, user_id, notes
    )
    VALUES (
      v_invoice.organization_id, v_item.product_id, 'OUT', v_item.quantity, p_user_id,
      'Anulación factura de compra N° ' || v_invoice.invoice_number
    );
  END LOOP;

  -- Mark as cancelled
  UPDATE purchase_invoices
  SET status     = 'CANCELLED',
      updated_at = now()
  WHERE id = p_invoice_id;
END;
$$;
