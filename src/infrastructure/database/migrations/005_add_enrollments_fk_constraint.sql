-- Add explicit foreign key constraint on enrollments.student_id
-- This ensures referential integrity and prevents invalid student_id values

-- First, check if there's an existing unnamed constraint and drop it
-- The initial schema created an implicit constraint without a name
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Find the existing foreign key constraint on enrollments.student_id
  SELECT tc.constraint_name INTO constraint_name
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name = 'enrollments'
    AND kcu.column_name = 'student_id'
  LIMIT 1;

  -- If a constraint exists, drop it so we can recreate with proper name and ON DELETE CASCADE
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE enrollments DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Dropped existing constraint: %', constraint_name;
  END IF;
END $$;

-- Add the properly named foreign key constraint with ON DELETE CASCADE
ALTER TABLE enrollments
ADD CONSTRAINT fk_enrollments_student_id
FOREIGN KEY (student_id) REFERENCES users(id)
ON DELETE CASCADE;

-- Verify the constraint was created
DO $$
DECLARE
  constraint_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_enrollments_student_id'
      AND table_name = 'enrollments'
      AND constraint_type = 'FOREIGN KEY'
  ) INTO constraint_exists;

  IF constraint_exists THEN
    RAISE NOTICE 'Foreign key constraint fk_enrollments_student_id created successfully';
  ELSE
    RAISE EXCEPTION 'Failed to create foreign key constraint';
  END IF;
END $$;
