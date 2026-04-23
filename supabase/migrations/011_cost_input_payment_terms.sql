-- 011: Add supplier payment terms to cost_inputs
ALTER TABLE cost_inputs ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT '';

COMMENT ON COLUMN cost_inputs.payment_terms IS 'תנאי תשלום לספק — למשל: 30% מקדמה, יתרה שוטף +60';
