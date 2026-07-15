-- Returns ONLY the price-peg currency code (USD/EUR/GBP) for a shared quote,
-- so the public /quote/[token] page can show the currency-peg note without
-- exposing any cost/supplier prices to anon. SECURITY DEFINER reads the linked
-- cost input (whose rows are NOT anon-readable) and returns just a 3-letter code.
CREATE OR REPLACE FUNCTION public.shared_quote_peg_currency(p_token text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH q AS (
    SELECT qt.quote_id
    FROM public.quote_share_tokens qt
    WHERE qt.token = p_token AND qt.expires_at > now()
    LIMIT 1
  ),
  ci AS (
    SELECT c.id, c.currency
    FROM public.quotes qu
    JOIN q ON q.quote_id = qu.id
    JOIN public.cost_inputs c ON c.id = qu.cost_input_id
    LIMIT 1
  )
  SELECT COALESCE(
    (SELECT currency FROM ci WHERE currency IS NOT NULL AND currency <> 'ILS'),
    (SELECT cii.original_currency
       FROM public.cost_input_items cii
       JOIN ci ON ci.id = cii.cost_input_id
      WHERE cii.original_currency IS NOT NULL AND cii.original_currency <> 'ILS'
        AND cii.original_price > 0
      LIMIT 1)
  );
$$;

REVOKE ALL ON FUNCTION public.shared_quote_peg_currency(text) FROM public;
GRANT EXECUTE ON FUNCTION public.shared_quote_peg_currency(text) TO anon, authenticated;
