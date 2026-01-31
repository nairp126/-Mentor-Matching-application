-- Additional tables for review validation and moderation

-- Review moderation queue table
CREATE TABLE IF NOT EXISTS review_moderation_queue (
    id VARCHAR(100) PRIMARY KEY,
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    violations JSONB NOT NULL,
    priority VARCHAR(20) DEFAULT 'MEDIUM' CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'CANCELLED')),
    assigned_moderator_id UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Review moderation actions table
CREATE TABLE IF NOT EXISTS review_moderation_actions (
    id VARCHAR(100) PRIMARY KEY,
    review_id UUID REFERENCES reviews(id) ON DELETE CASCADE,
    moderator_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(30) NOT NULL CHECK (action IN ('APPROVE', 'REJECT', 'EDIT', 'FLAG', 'REQUEST_CLARIFICATION')),
    reason TEXT NOT NULL,
    original_content TEXT,
    edited_content TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add metadata column to reviews table if not exists
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Create indexes for review validation and moderation
CREATE INDEX IF NOT EXISTS idx_review_moderation_queue_status ON review_moderation_queue(status);
CREATE INDEX IF NOT EXISTS idx_review_moderation_queue_priority ON review_moderation_queue(priority);
CREATE INDEX IF NOT EXISTS idx_review_moderation_queue_created_at ON review_moderation_queue(created_at);
CREATE INDEX IF NOT EXISTS idx_review_moderation_queue_assigned_moderator ON review_moderation_queue(assigned_moderator_id);

CREATE INDEX IF NOT EXISTS idx_review_moderation_actions_review_id ON review_moderation_actions(review_id);
CREATE INDEX IF NOT EXISTS idx_review_moderation_actions_moderator_id ON review_moderation_actions(moderator_id);
CREATE INDEX IF NOT EXISTS idx_review_moderation_actions_action ON review_moderation_actions(action);
CREATE INDEX IF NOT EXISTS idx_review_moderation_actions_created_at ON review_moderation_actions(created_at);

CREATE INDEX IF NOT EXISTS idx_reviews_metadata ON reviews USING GIN(metadata);

-- Add trigger for updated_at on review_moderation_queue table
DROP TRIGGER IF EXISTS update_review_moderation_queue_updated_at ON review_moderation_queue;
CREATE TRIGGER update_review_moderation_queue_updated_at BEFORE UPDATE ON review_moderation_queue FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();