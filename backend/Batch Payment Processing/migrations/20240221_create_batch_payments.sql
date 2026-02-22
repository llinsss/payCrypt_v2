-- Create batch_payments table
CREATE TABLE IF NOT EXISTS batch_payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  total_payments INTEGER NOT NULL,
  successful_payments INTEGER DEFAULT 0,
  failed_payments INTEGER DEFAULT 0,
  total_amount DECIMAL(20, 8) NOT NULL,
  total_fees DECIMAL(20, 8) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  failure_mode VARCHAR(10) NOT NULL,
  results JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  CONSTRAINT valid_failure_mode CHECK (failure_mode IN ('abort', 'continue'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_batch_payments_user_id ON batch_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_payments_status ON batch_payments(status);

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  recipient_tag VARCHAR(255) NOT NULL,
  amount DECIMAL(20, 8) NOT NULL,
  asset VARCHAR(10) NOT NULL,
  memo TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  transaction_id VARCHAR(255),
  batch_payment_id INTEGER REFERENCES batch_payments(id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create index on batch_payment_id
CREATE INDEX IF NOT EXISTS idx_payments_batch_payment_id ON payments(batch_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
