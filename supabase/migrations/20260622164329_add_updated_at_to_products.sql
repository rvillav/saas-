-- ============================================================
-- Agrega columna updated_at a products.
-- Los RPCs create_purchase_invoice y cancel_purchase_invoice
-- ya hacen SET updated_at = now() al actualizar stock;
-- sin esta columna la operacion fallaba con error de columna.
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now() NOT NULL;
