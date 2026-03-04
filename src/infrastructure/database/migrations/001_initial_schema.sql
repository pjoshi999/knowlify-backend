-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('STUDENT', 'INSTRUCTOR', 'ADMIN')),
  name VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role) WHERE deleted_at IS NULL;

-- Courses table
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(100) NOT NULL,
  thumbnail_url TEXT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  price_amount INTEGER NOT NULL,
  price_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  manifest JSONB NOT NULL DEFAULT '{}',
  url_slug VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  published_at TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_courses_instructor ON courses(instructor_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_status ON courses(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_category ON courses(category) WHERE deleted_at IS NULL AND status = 'PUBLISHED';
CREATE INDEX idx_courses_created_at ON courses(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_url_slug ON courses(url_slug) WHERE deleted_at IS NULL;
CREATE INDEX idx_courses_manifest ON courses USING GIN(manifest);
CREATE INDEX idx_courses_name_trgm ON courses USING GIN(name gin_trgm_ops);
CREATE INDEX idx_courses_description_trgm ON courses USING GIN(description gin_trgm_ops);

-- Course assets table
CREATE TABLE course_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  asset_type VARCHAR(20) NOT NULL CHECK (asset_type IN ('VIDEO', 'PDF', 'QUIZ', 'EXAM', 'NOTE', 'OTHER')),
  file_name VARCHAR(500) NOT NULL,
  file_size BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  duration INTEGER,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_course_assets_course ON course_assets(course_id);
CREATE INDEX idx_course_assets_type ON course_assets(course_id, asset_type);

-- Payments table
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES users(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  amount INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED')),
  stripe_payment_intent_id VARCHAR(255) UNIQUE NOT NULL,
  stripe_charge_id VARCHAR(255),
  failure_reason TEXT,
  refund_reason TEXT,
  refunded_amount INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  refunded_at TIMESTAMP
);

CREATE INDEX idx_payments_student ON payments(student_id);
CREATE INDEX idx_payments_course ON payments(course_id);
CREATE INDEX idx_payments_stripe_intent ON payments(stripe_payment_intent_id);
CREATE INDEX idx_payments_status ON payments(status, created_at DESC);

-- Enrollments table
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES users(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  payment_id UUID NOT NULL REFERENCES payments(id),
  progress JSONB NOT NULL DEFAULT '{"completedLessons": [], "watchedVideos": {}}',
  enrolled_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  UNIQUE(student_id, course_id)
);

CREATE INDEX idx_enrollments_student ON enrollments(student_id);
CREATE INDEX idx_enrollments_course ON enrollments(course_id);
CREATE INDEX idx_enrollments_last_accessed ON enrollments(student_id, last_accessed_at DESC);

-- Reviews table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES users(id),
  course_id UUID NOT NULL REFERENCES courses(id),
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, course_id)
);

CREATE INDEX idx_reviews_course ON reviews(course_id);
CREATE INDEX idx_reviews_student ON reviews(student_id);
CREATE INDEX idx_reviews_rating ON reviews(course_id, rating);

-- Chat sessions table (for course upload chatbot)
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL REFERENCES users(id),
  course_id UUID REFERENCES courses(id),
  messages JSONB NOT NULL DEFAULT '[]',
  status VARCHAR(20) NOT NULL CHECK (status IN ('ACTIVE', 'COMPLETED', 'ABANDONED')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_chat_sessions_instructor ON chat_sessions(instructor_id);
CREATE INDEX idx_chat_sessions_status ON chat_sessions(status, updated_at DESC);

-- Audit log table
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(50) NOT NULL,
  resource_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON courses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
