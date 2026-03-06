-- Add updated_at column to payments table
ALTER TABLE payments ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT NOW();

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
