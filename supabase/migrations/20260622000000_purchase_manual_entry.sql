-- ============================================================
-- Actualizar create_purchase_invoice para aceptar ingreso manual
-- de productos (product_name + brand + category) en lugar de
-- requerir product_id. El RPC busca el producto por nombre+marca
-- dentro de la organización y lo crea automáticamente si no existe.
-- Al ser SECURITY DEFINER, bypasea RLS para estas operaciones.
-- ============================================================

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
  v_invoice_id      uuid;
  v_item            jsonb;
  v_resolved        jsonb;
  v_resolved_items  jsonb := '[]'::jsonb;
  v_product_id      uuid;
  v_quantity        integer;
  v_unit_price      numeric;
  v_total           numeric := 0;
  v_subtotal        numeric;
  v_tax             numeric;
  v_prefix          text;
  v_next_num        integer;
  v_sku             text;
BEGIN
  -- Validar pertenencia a la organización
  IF p_org_id IS DISTINCT FROM get_user_org_id() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La factura debe tener al menos un ítem.';
  END IF;

  -- Primera pasada: resolver product_id (buscar o crear) y acumular total
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_quantity   := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_purchase_price')::numeric;

    IF v_quantity < 1 THEN
      RAISE EXCEPTION 'La cantidad debe ser al menos 1.';
    END IF;

    -- Resolver product_id: usar el provisto o buscar/crear por nombre+marca
    IF v_item ? 'product_id'
       AND (v_item->>'product_id') IS NOT NULL
       AND (v_item->>'product_id') <> ''
    THEN
      v_product_id := (v_item->>'product_id')::uuid;
      IF NOT EXISTS (
        SELECT 1 FROM products
        WHERE id = v_product_id AND organization_id = p_org_id
      ) THEN
        RAISE EXCEPTION 'Producto no encontrado o no pertenece a la organización.';
      END IF;

    ELSE
      -- Ingreso manual: buscar por nombre + marca (case-insensitive)
      SELECT id INTO v_product_id
      FROM products
      WHERE organization_id = p_org_id
        AND lower(trim(name))  = lower(trim(v_item->>'product_name'))
        AND lower(trim(brand)) = lower(trim(v_item->>'brand'))
      LIMIT 1;

      IF v_product_id IS NULL THEN
        -- Generar SKU automático
        v_prefix := CASE v_item->>'category'
          WHEN 'MASCARILLA'          THEN 'MASC'
          WHEN 'CPAP'                THEN 'CPAP'
          WHEN 'TUBO_CALEFACCIONADO' THEN 'TUBO'
          ELSE                           'OTRO'
        END;

        SELECT COALESCE(
          MAX(
            CASE
              WHEN sku ~ ('^' || v_prefix || '-[0-9]+$')
              THEN split_part(sku, '-', 2)::integer
              ELSE 0
            END
          ),
          0
        ) + 1
        INTO v_next_num
        FROM products
        WHERE organization_id = p_org_id
          AND sku LIKE v_prefix || '-%';

        v_sku := v_prefix || '-' || lpad(v_next_num::text, 4, '0');

        INSERT INTO products (
          name, brand, category,
          unit_price, current_stock,
          organization_id, sku, description
        ) VALUES (
          trim(v_item->>'product_name'),
          trim(v_item->>'brand'),
          v_item->>'category',
          0, 0,
          p_org_id, v_sku, NULL
        )
        RETURNING id INTO v_product_id;
      END IF;
    END IF;

    v_total := v_total + (v_quantity * v_unit_price);

    -- Guardar ítem resuelto
    v_resolved_items := v_resolved_items || jsonb_build_array(
      jsonb_build_object(
        'product_id',          v_product_id,
        'quantity',            v_quantity,
        'unit_purchase_price', v_unit_price
      )
    );
  END LOOP;

  -- Desglose IVA: precios son IVA incluido → neto = total / 1.19
  v_subtotal := round(v_total / 1.19, 0);
  v_tax      := v_total - v_subtotal;

  -- Insertar cabecera de factura
  INSERT INTO purchase_invoices (
    organization_id, invoice_number, supplier_name, supplier_rut,
    purchase_date, subtotal, tax_amount, total_amount, notes, created_by
  ) VALUES (
    p_org_id, p_invoice_number, p_supplier_name, p_supplier_rut,
    p_purchase_date, v_subtotal, v_tax, v_total, p_notes, p_user_id
  )
  RETURNING id INTO v_invoice_id;

  -- Segunda pasada: insertar ítems, incrementar stock, registrar movimientos
  FOR v_resolved IN SELECT * FROM jsonb_array_elements(v_resolved_items)
  LOOP
    v_product_id := (v_resolved->>'product_id')::uuid;
    v_quantity   := (v_resolved->>'quantity')::integer;
    v_unit_price := (v_resolved->>'unit_purchase_price')::numeric;

    INSERT INTO purchase_invoice_items (
      purchase_invoice_id, product_id, quantity, unit_purchase_price
    ) VALUES (v_invoice_id, v_product_id, v_quantity, v_unit_price);

    UPDATE products
    SET current_stock  = current_stock + v_quantity,
        purchase_price = v_unit_price,
        updated_at     = now()
    WHERE id = v_product_id AND organization_id = p_org_id;

    INSERT INTO inventory_movements (
      organization_id, product_id, type, quantity, user_id, notes
    ) VALUES (
      p_org_id, v_product_id, 'IN', v_quantity, p_user_id,
      'Factura de compra N° ' || p_invoice_number || ' — ' || p_supplier_name
    );
  END LOOP;

  RETURN v_invoice_id;
END;
$$;
