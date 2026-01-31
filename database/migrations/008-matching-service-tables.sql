-- Migration: Add matching service tables
-- Description: Creates tables for matching preferences and feedback

-- Matching preferences table
CREATE TABLE IF NOT EXISTS matching_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    preferred_expertise_areas JSONB DEFAULT '[]'::jsonb,
    preferred_session_types JSONB DEFAULT '[]'::jsonb,
    preferred_time_slots JSONB DEFAULT '[]'::jsonb,
    max_travel_time INTEGER, -- in minutes
    min_mentor_rating DECIMAL(2,1) CHECK (min_mentor_rating >= 1 AND min_mentor_rating <= 5),
    preferred_mentor_experience VARCHAR(20) CHECK (preferred_mentor_experience IN ('ANY', 'JUNIOR', 'SENIOR', 'EXPERT')),
    session_frequency VARCHAR(20) CHECK (session_frequency IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'FLEXIBLE')),
    learning_style VARCHAR(20) CHECK (learning_style IN ('VISUAL', 'AUDITORY', 'KINESTHETIC', 'MIXED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Matching feedback table
CREATE TABLE IF NOT EXISTS matching_feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    attended BOOLEAN NOT NULL DEFAULT false,
    helpful BOOLEAN NOT NULL DEFAULT false,
    match_quality INTEGER NOT NULL CHECK (match_quality >= 1 AND match_quality <= 5),
    feedback TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(session_id, student_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_matching_preferences_user_id ON matching_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_matching_preferences_expertise ON matching_preferences USING GIN(preferred_expertise_areas);
CREATE INDEX IF NOT EXISTS idx_matching_preferences_session_types ON matching_preferences USING GIN(preferred_session_types);

CREATE INDEX IF NOT EXISTS idx_matching_feedback_session_id ON matching_feedback(session_id);
CREATE INDEX IF NOT EXISTS idx_matching_feedback_student_id ON matching_feedback(student_id);
CREATE INDEX IF NOT EXISTS idx_matching_feedback_rating ON matching_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_matching_feedback_created_at ON matching_feedback(created_at);

-- Update trigger for matching_preferences
CREATE OR REPLACE FUNCTION update_matching_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_matching_preferences_updated_at
    BEFORE UPDATE ON matching_preferences
    FOR EACH ROW
    EXECUTE FUNCTION update_matching_preferences_updated_at();

-- Comments for documentation
COMMENT ON TABLE matching_preferences IS 'User preferences for session matching algorithm';
COMMENT ON COLUMN matching_preferences.preferred_expertise_areas IS 'JSON array of preferred expertise areas';
COMMENT ON COLUMN matching_preferences.preferred_session_types IS 'JSON array of preferred session types (ONE_ON_ONE, GROUP, WORKSHOP)';
COMMENT ON COLUMN matching_preferences.preferred_time_slots IS 'JSON array of preferred time slots with day, start/end times, and timezone';
COMMENT ON COLUMN matching_preferences.max_travel_time IS 'Maximum travel time in minutes for in-person sessions';
COMMENT ON COLUMN matching_preferences.min_mentor_rating IS 'Minimum acceptable mentor rating (1-5)';

COMMENT ON TABLE matching_feedback IS 'Feedback on session recommendations and matching quality';
COMMENT ON COLUMN matching_feedback.match_quality IS 'How well the session matched expectations (1-5)';
COMMENT ON COLUMN matching_feedback.attended IS 'Whether the student attended the session';
COMMENT ON COLUMN matching_feedback.helpful IS 'Whether the session was helpful';