-- Atomic server-side duplicate for cost_inputs:
-- copies the row + all its items in one transaction. SECURITY INVOKER so
-- the existing RLS (projects edit) still gates who can call it.
CREATE OR REPLACE FUNCTION public.duplicate_cost_input(p_ci_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_new_id uuid;
BEGIN
  INSERT INTO cost_inputs (project_id, source_type, source_name, notes, currency, exchange_rate, exchange_rate_date, payment_terms)
  SELECT project_id, source_type, source_name || ' (העתק)', notes, currency, exchange_rate, exchange_rate_date, payment_terms
  FROM cost_inputs WHERE id = p_ci_id
  RETURNING id INTO v_new_id;

  IF v_new_id IS NULL THEN
    RAISE EXCEPTION 'cost_input % not found or not visible', p_ci_id;
  END IF;

  INSERT INTO cost_input_items (
    cost_input_id, product_name, dn_size, quantity, unit, cost_price, total_cost,
    notes, sort_order, original_price, original_currency, item_type, sn, pn, length_m
  )
  SELECT v_new_id, product_name, dn_size, quantity, unit, cost_price, total_cost,
         notes, sort_order, original_price, original_currency, item_type, sn, pn, length_m
  FROM cost_input_items WHERE cost_input_id = p_ci_id;

  RETURN v_new_id;
END; $$;

REVOKE EXECUTE ON FUNCTION public.duplicate_cost_input(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.duplicate_cost_input(uuid) TO authenticated;
