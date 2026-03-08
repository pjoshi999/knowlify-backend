-- Migration 009: Modules and Lessons System
-- Creates tables for course module organization and AI-powered lesson analysis

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Modules table
CREATE TABLE modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Lessons table
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50) NOT NULL CHECK (type IN ('VIDEO', 'PDF', 'IMAGE', 'QUIZ', 'EXAM', 'NOTE', 'OTHER')),
  "order" INTEGER NOT NULL,
  asset_id UUID REFERENCES course_assets(id) ON DELETE SET NULL,
  duration INTEGER, -- Duration in minutes (for videos)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Lesson AI Analysis table
CREATE TABLE lesson_ai_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_id UUID NOT NULL UNIQUE REFERENCES lessons(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  topics JSONB NOT NULL DEFAULT '[]', -- Array of key topics
  learning_objectives JSONB NOT NULL DEFAULT '[]', -- Array of learning objectives
  key_points JSONB NOT NULL DEFAULT '[]', -- Array of key points
  difficulty VARCHAR(50) CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  transcription TEXT, -- Full video transcription (for videos)
  analyzed_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Upload Sessions table (for folder/video uploads)
CREATE TABLE upload_sessions_v2 (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  instructor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL CHECK (status IN ('uploading', 'analyzing', 'complete', 'failed')) DEFAULT 'uploading',
  file_count INTEGER NOT NULL DEFAULT 0,
  total_size BIGINT NOT NULL DEFAULT 0, -- Total size in bytes
  folder_structure JSONB, -- Original folder hierarchy
  temp_storage_paths JSONB DEFAULT '[]', -- Array of temp S3 paths
  suggested_structure JSONB, -- AI-suggested course structure
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add storagePath column to course_assets table
ALTER TABLE course_assets ADD COLUMN IF NOT EXISTS storage_path VARCHAR(1024);

-- Create indexes for performance
CREATE INDEX idx_modules_course_order ON modules(course_id, "order");
CREATE INDEX idx_lessons_module_order ON lessons(module_id, "order");
CREATE INDEX idx_lesson_analysis_lesson ON lesson_ai_analysis(lesson_id);
CREATE INDEX idx_upload_sessions_instructor ON upload_sessions_v2(instructor_id, created_at);
CREATE INDEX idx_upload_sessions_expires ON upload_sessions_v2(expires_at);
CREATE INDEX idx_course_assets_storage_path ON course_assets(storage_path);

-- Create GIN indexes for JSONB array search
CREATE INDEX idx_lesson_analysis_topics ON lesson_ai_analysis USING GIN (topics);
CREATE INDEX idx_lesson_analysis_objectives ON lesson_ai_analysis USING GIN (learning_objectives);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_modules_updated_at BEFORE UPDATE ON modules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON lessons
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lesson_ai_analysis_updated_at BEFORE UPDATE ON lesson_ai_analysis
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_upload_sessions_v2_updated_at BEFORE UPDATE ON upload_sessions_v2
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add unique constraint for module order within course
CREATE UNIQUE INDEX idx_modules_course_order_unique ON modules(course_id, "order");

-- Add unique constraint for lesson order within module
CREATE UNIQUE INDEX idx_lessons_module_order_unique ON lessons(module_id, "order");

-- Comments for documentation
COMMENT ON TABLE modules IS 'Course modules for organizing lessons into logical groupings';
COMMENT ON TABLE lessons IS 'Individual learning units within modules (videos, PDFs, images, etc.)';
COMMENT ON TABLE lesson_ai_analysis IS 'AI-generated analysis and insights for lessons';
COMMENT ON TABLE upload_sessions_v2 IS 'Temporary sessions for folder/video uploads with AI analysis';
COMMENT ON COLUMN modules."order" IS 'Display order within course (1-based, sequential)';
COMMENT ON COLUMN lessons."order" IS 'Display order within module (1-based, sequential)';
COMMENT ON COLUMN lesson_ai_analysis.topics IS 'JSONB array of key topics covered in the lesson';
COMMENT ON COLUMN lesson_ai_analysis.learning_objectives IS 'JSONB array of learning objectives';
COMMENT ON COLUMN lesson_ai_analysis.key_points IS 'JSONB array of key points students should remember';
COMMENT ON COLUMN upload_sessions_v2.folder_structure IS 'JSONB representation of original folder hierarchy';
COMMENT ON COLUMN upload_sessions_v2.suggested_structure IS 'AI-suggested course structure with modules and lessons';
