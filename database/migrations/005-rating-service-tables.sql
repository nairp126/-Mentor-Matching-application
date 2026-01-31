-- Additional tables for rating and review system

-- Rating prompts table
CREATE TABLE IF NOT EXISTS rating_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    prompt_type VARCHAR(20) NOT NULL CHECK (prompt_type IN ('MENTOR_RATING', 'STUDENT_RATING', 'SESSION_RATING')),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'DISMISSED', 'EXPIRED')),
    scheduled_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    reminders_sent INTEGER DEFAULT 0,
    max_reminders INTEGER DEFAULT 3,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Enhanced reviews table (extending existing reviews table)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN DEFAULT false;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create indexes for rating system
CREATE INDEX IF NOT EXISTS idx_rating_prompts_user_id ON rating_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_rating_prompts_session_id ON rating_prompts(session_id);
CREATE INDEX IF NOT EXISTS idx_rating_prompts_status ON rating_prompts(status);
CREATE INDEX IF NOT EXISTS idx_rating_prompts_scheduled_at ON rating_prompts(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_rating_prompts_expires_at ON rating_prompts(expires_at);

-- Additional indexes for reviews table
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_rating ON reviews(reviewee_id, rating);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at);
CREATE INDEX IF NOT EXISTS idx_reviews_tags ON reviews USING GIN(tags);

-- Add trigger for updated_at on rating_prompts table
DROP TRIGGER IF EXISTS update_rating_prompts_updated_at ON rating_prompts;
CREATE TRIGGER update_rating_prompts_updated_at BEFORE UPDATE ON rating_prompts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add trigger for updated_at on reviews table (if not exists)
DROP TRIGGER IF EXISTS update_reviews_updated_at ON reviews;
CREATE TRIGGER update_reviews_updated_at BEFORE UPDATE ON reviews FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();