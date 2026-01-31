-- Additional tables for failure handling and escalation

-- Failure escalations table
CREATE TABLE IF NOT EXISTS failure_escalations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    failure_type VARCHAR(50) NOT NULL,
    failure_reason TEXT,
    escalated_at TIMESTAMP NOT NULL,
    resolved_at TIMESTAMP,
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Failure logs table for detailed tracking
CREATE TABLE IF NOT EXISTS failure_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for failure handling tables
CREATE INDEX IF NOT EXISTS idx_failure_escalations_notification_id ON failure_escalations(notification_id);
CREATE INDEX IF NOT EXISTS idx_failure_escalations_created_at ON failure_escalations(created_at);
CREATE INDEX IF NOT EXISTS idx_failure_escalations_escalated_at ON failure_escalations(escalated_at);
CREATE INDEX IF NOT EXISTS idx_failure_logs_notification_id ON failure_logs(notification_id);
CREATE INDEX IF NOT EXISTS idx_failure_logs_event_type ON failure_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_failure_logs_created_at ON failure_logs(created_at);

-- Add trigger for updated_at on failure_escalations table
DROP TRIGGER IF EXISTS update_failure_escalations_updated_at ON failure_escalations;
CREATE TRIGGER update_failure_escalations_updated_at BEFORE UPDATE ON failure_escalations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();