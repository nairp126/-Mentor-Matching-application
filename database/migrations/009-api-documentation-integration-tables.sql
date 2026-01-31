-- Migration: API Documentation and External Integration Tables
-- This migration creates tables for API keys, webhooks, and monitoring

-- API Keys table for external authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    permissions JSONB NOT NULL DEFAULT '[]',
    rate_limit_requests INTEGER NOT NULL DEFAULT 1000,
    rate_limit_window INTEGER NOT NULL DEFAULT 3600, -- in seconds
    active BOOLEAN NOT NULL DEFAULT true,
    last_used TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP
);

-- API Key usage tracking
CREATE TABLE IF NOT EXISTS api_key_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time INTEGER, -- in milliseconds
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Webhooks table for external integrations
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url VARCHAR(2048) NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    secret VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_delivery_at TIMESTAMP,
    failure_count INTEGER NOT NULL DEFAULT 0
);

-- Webhook events table
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(255) NOT NULL,
    data JSONB NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    version VARCHAR(50) NOT NULL DEFAULT '1.0',
    user_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Webhook deliveries table for tracking delivery attempts
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES webhook_events(id) ON DELETE CASCADE,
    url VARCHAR(2048) NOT NULL,
    http_status INTEGER,
    response_time INTEGER, -- in milliseconds
    attempts INTEGER NOT NULL DEFAULT 0,
    success BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMP
);

-- API metrics table for monitoring
CREATE TABLE IF NOT EXISTS api_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name VARCHAR(255) NOT NULL,
    metric_value NUMERIC NOT NULL,
    tags JSONB DEFAULT '{}',
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);

CREATE INDEX IF NOT EXISTS idx_api_key_usage_api_key_id ON api_key_usage(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_created_at ON api_key_usage(created_at);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_endpoint ON api_key_usage(endpoint);

CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active);
CREATE INDEX IF NOT EXISTS idx_webhooks_events ON webhooks USING GIN(events);

CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_timestamp ON webhook_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_webhook_events_user_id ON webhook_events(user_id);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event_id ON webhook_deliveries(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_success ON webhook_deliveries(success);

CREATE INDEX IF NOT EXISTS idx_api_metrics_name ON api_metrics(metric_name);
CREATE INDEX IF NOT EXISTS idx_api_metrics_timestamp ON api_metrics(timestamp);
CREATE INDEX IF NOT EXISTS idx_api_metrics_tags ON api_metrics USING GIN(tags);

-- Create updated_at trigger for api_keys
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_api_keys_updated_at();

-- Create updated_at trigger for webhooks
CREATE OR REPLACE FUNCTION update_webhooks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_webhooks_updated_at();

-- Insert sample webhook event types for reference
INSERT INTO webhook_events (id, type, data, version) VALUES 
(gen_random_uuid(), 'session.created', '{"description": "Triggered when a new session is created"}', '1.0'),
(gen_random_uuid(), 'session.updated', '{"description": "Triggered when a session is updated"}', '1.0'),
(gen_random_uuid(), 'session.cancelled', '{"description": "Triggered when a session is cancelled"}', '1.0'),
(gen_random_uuid(), 'session.completed', '{"description": "Triggered when a session is completed"}', '1.0'),
(gen_random_uuid(), 'user.registered', '{"description": "Triggered when a new user registers"}', '1.0'),
(gen_random_uuid(), 'user.profile.updated', '{"description": "Triggered when a user updates their profile"}', '1.0'),
(gen_random_uuid(), 'message.sent', '{"description": "Triggered when a message is sent"}', '1.0'),
(gen_random_uuid(), 'rating.submitted', '{"description": "Triggered when a rating is submitted"}', '1.0'),
(gen_random_uuid(), 'notification.sent', '{"description": "Triggered when a notification is sent"}', '1.0')
ON CONFLICT DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE api_keys IS 'API keys for external authentication and access control';
COMMENT ON TABLE api_key_usage IS 'Usage tracking for API keys including endpoints and response times';
COMMENT ON TABLE webhooks IS 'Webhook endpoints for external integrations';
COMMENT ON TABLE webhook_events IS 'Events that can trigger webhook deliveries';
COMMENT ON TABLE webhook_deliveries IS 'Delivery attempts and results for webhook events';
COMMENT ON TABLE api_metrics IS 'API performance and usage metrics';

COMMENT ON COLUMN api_keys.key_hash IS 'SHA256 hash of the API key for secure storage';
COMMENT ON COLUMN api_keys.permissions IS 'JSON array of permissions granted to this API key';
COMMENT ON COLUMN api_keys.rate_limit_requests IS 'Number of requests allowed per window';
COMMENT ON COLUMN api_keys.rate_limit_window IS 'Rate limit window in seconds';

COMMENT ON COLUMN webhooks.events IS 'JSON array of event types this webhook subscribes to';
COMMENT ON COLUMN webhooks.secret IS 'Secret key for webhook signature verification';
COMMENT ON COLUMN webhooks.failure_count IS 'Number of consecutive delivery failures';

COMMENT ON COLUMN webhook_deliveries.attempts IS 'Number of delivery attempts made';
COMMENT ON COLUMN webhook_deliveries.response_time IS 'Response time in milliseconds';
COMMENT ON COLUMN webhook_deliveries.error_message IS 'Error message if delivery failed';