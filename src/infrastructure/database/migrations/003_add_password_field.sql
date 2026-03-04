-- Add password field to users table
ALTER TABLE users ADD COLUMN password VARCHAR(255) NOT NULL DEFAULT '';

-- Remove the default after adding the column
ALTER TABLE users ALTER COLUMN password DROP DEFAULT;
