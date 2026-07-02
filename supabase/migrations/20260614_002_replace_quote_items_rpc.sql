-- 20260614_002: atomic replace of a quote's items.
-- setQuoteCostInput did DELETE then INSERT in two round-trips with no
-- transaction, so an INSERT failure left the quote with zero items while the
-- client cache still showed the old ones. This function does both in a single
-- transaction (a failed INSERT rolls the DELETE back), keeping the old items.
-- SECURITY INVOKER (default) so RLS on quote_items is enforced as the caller.

CREATE OR REPLACE FUNCTION public.replace_quote_items(p_quote_id uuid, p_items jsonb)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.quote_items WHERE quote_id = p_quote_id;
  IF jsonb_array_length(p_items) > 0 THEN
    INSERT INTO public.quote_items (
      quote_id, product_name, dn_size, quantity, unit, cost_price,
      overheads_pct, profit_pct, discount_pct, unit_price, total_price,
      notes, pn, sn, sort_order)
    SELECT p_quote_id, x.product_name, x.dn_size, x.quantity, x.unit, x.cost_price,
      x.overheads_pct, x.profit_pct, x.discount_pct, x.unit_price, x.total_price,
      x.notes, x.pn, x.sn, x.sort_order
    FROM jsonb_to_recordset(p_items) AS x(
      product_name text, dn_size text, quantity numeric, unit text, cost_price numeric,
      overheads_pct numeric, profit_pct numeric, discount_pct numeric, unit_price numeric,
      total_price numeric, notes text, pn numeric, sn integer, sort_order integer);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_quote_items(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.replace_quote_items(uuid, jsonb) TO authenticated;
