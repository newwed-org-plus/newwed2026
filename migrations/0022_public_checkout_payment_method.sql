ALTER TABLE public_checkout_sessions
  ADD COLUMN payment_method TEXT CHECK (payment_method IN ('PIX', 'CREDIT_CARD'));
