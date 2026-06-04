-- ============================================================
-- Add Inventory Loans Module:
-- 1. Create public.loans table
-- 2. Configure RLS (Row Level Security) and Policies
-- 3. Define create_loan and return_loan RPC functions
-- ============================================================

-- ── 1. Create public.loans table ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.loans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  borrower_name text NOT NULL,
  borrower_rut text DEFAULT NULL::text,
  borrower_phone text DEFAULT NULL::text,
  borrower_email text DEFAULT NULL::text,
  quantity integer NOT NULL CHECK (quantity > 0),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  expected_return_date date DEFAULT NULL::date,
  actual_return_date date DEFAULT NULL::date,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RETURNED', 'LOST')),
  notes text DEFAULT NULL::text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ── 2. Enable RLS and Policies ────────────────────────────────
ALTER TABLE public.loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loans_select ON public.loans;
CREATE POLICY loans_select ON public.loans FOR SELECT
  USING (organization_id = get_user_org_id());

DROP POLICY IF EXISTS loans_insert ON public.loans;
CREATE POLICY loans_insert ON public.loans FOR INSERT
  WITH CHECK ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])));

DROP POLICY IF EXISTS loans_update ON public.loans;
CREATE POLICY loans_update ON public.loans FOR UPDATE
  USING ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])))
  WITH CHECK ((organization_id = get_user_org_id()) AND (get_user_role() = ANY (ARRAY['ADMIN'::text, 'USER'::text])));

DROP POLICY IF EXISTS loans_delete ON public.loans;
CREATE POLICY loans_delete ON public.loans FOR DELETE
  USING ((organization_id = get_user_org_id()) AND (get_user_role() = 'ADMIN'::text));

-- ── 3. Define RPC functions ───────────────────────────────────

-- RPC to create a loan and deduct stock atomically
CREATE OR REPLACE FUNCTION public.create_loan(
  p_org_id uuid,
  p_product_id uuid,
  p_borrower_name text,
  p_borrower_rut text DEFAULT NULL::text,
  p_borrower_phone text DEFAULT NULL::text,
  p_borrower_email text DEFAULT NULL::text,
  p_quantity integer DEFAULT 1,
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
  v_loan_id uuid;
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

  INSERT INTO loans (
    organization_id, product_id, borrower_name, borrower_rut,
    borrower_phone, borrower_email, quantity,
    start_date, expected_return_date, notes, status
  ) VALUES (
    p_org_id, p_product_id, p_borrower_name, p_borrower_rut,
    p_borrower_phone, p_borrower_email, p_quantity,
    p_start_date, p_expected_return_date, p_notes, 'ACTIVE'
  ) RETURNING id INTO v_loan_id;

  INSERT INTO inventory_movements (organization_id, product_id, type, quantity, user_id, notes)
  VALUES (
    p_org_id, p_product_id, 'OUT', p_quantity, p_user_id,
    'Préstamo de insumo a ' || p_borrower_name
  );

  RETURN v_loan_id;
END;
$$;

-- RPC to return a loan and restore stock atomically
CREATE OR REPLACE FUNCTION public.return_loan(
  p_loan_id uuid,
  p_status text DEFAULT 'RETURNED',
  p_user_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan loans%ROWTYPE;
BEGIN
  SELECT * INTO v_loan
  FROM loans
  WHERE id = p_loan_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Préstamo no encontrado.';
  END IF;

  -- Validate org ownership
  IF v_loan.organization_id IS DISTINCT FROM get_user_org_id() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF v_loan.status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Este préstamo no está activo (estado: %).', v_loan.status;
  END IF;

  IF p_status NOT IN ('RETURNED', 'LOST') THEN
    RAISE EXCEPTION 'Estado no válido: %', p_status;
  END IF;

  UPDATE loans
  SET status = p_status,
      actual_return_date = CURRENT_DATE,
      updated_at = now()
  WHERE id = p_loan_id;

  -- If returned, restore the stock. If lost, it is permanently gone (no stock restoration needed).
  IF p_status = 'RETURNED' THEN
    UPDATE products
    SET current_stock = current_stock + v_loan.quantity
    WHERE id = v_loan.product_id;

    INSERT INTO inventory_movements (organization_id, product_id, type, quantity, user_id, notes)
    VALUES (
      v_loan.organization_id, v_loan.product_id, 'IN', v_loan.quantity, p_user_id,
      'Devolución de préstamo de ' || v_loan.borrower_name
    );
  ELSIF p_status = 'LOST' THEN
    INSERT INTO inventory_movements (organization_id, product_id, type, quantity, user_id, notes)
    VALUES (
      v_loan.organization_id, v_loan.product_id, 'OUT', 0, p_user_id,
      'Préstamo de ' || v_loan.borrower_name || ' marcado como PERDIDO'
    );
  END IF;
END;
$$;
