-- ============================================================
-- RPC delete_rental:
-- Elimina un arriendo de forma atomica.
-- Si el arriendo estaba ACTIVO u OVERDUE, restaura el stock
-- e inserta un movimiento IN de reversion.
-- Solo puede ejecutarlo un usuario de la misma organizacion.
-- ============================================================

CREATE OR REPLACE FUNCTION public.delete_rental(
  p_rental_id uuid,
  p_user_id   uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rental rentals%ROWTYPE;
BEGIN
  SELECT * INTO v_rental
  FROM rentals
  WHERE id = p_rental_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Arriendo no encontrado.';
  END IF;

  IF v_rental.organization_id IS DISTINCT FROM get_user_org_id() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Si estaba activo o vencido, devolver el stock
  IF v_rental.status IN ('ACTIVE', 'OVERDUE') THEN
    UPDATE products
    SET current_stock = current_stock + v_rental.quantity
    WHERE id = v_rental.product_id;

    INSERT INTO inventory_movements (
      organization_id, product_id, type, quantity, user_id, notes
    ) VALUES (
      v_rental.organization_id,
      v_rental.product_id,
      'IN',
      v_rental.quantity,
      p_user_id,
      'Eliminacion de arriendo — ' || v_rental.client_name
    );
  END IF;

  DELETE FROM rentals WHERE id = p_rental_id;
END;
$$;
