-- הנחת סכום קבועה ברמת ההצעה (בנוסף להנחת האחוזים global_discount_pct).
-- מוחלת אחרי הנחת האחוזים: subtotal -> pct -> amount -> VAT.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) DEFAULT 0;
