-- Dynamic DNS Service Database Schema for Neon PostgreSQL
-- Service: ipn.fyi

-- Main table for DNS records and IP history
CREATE TABLE IF NOT EXISTS dns_records (
    id SERIAL PRIMARY KEY,
    afterdark_login VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    current_ipv4 INET,
    last_ipv4 INET,
    current_ipv6 INET,
    last_ipv6 INET,
    updated_at BIGINT NOT NULL, -- Unix timestamp
    comments TEXT,
    ref_num VARCHAR(100),
    version INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT unique_user_domain UNIQUE(afterdark_login, domain)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_afterdark_login ON dns_records(afterdark_login);
CREATE INDEX IF NOT EXISTS idx_domain ON dns_records(domain);
CREATE INDEX IF NOT EXISTS idx_updated_at ON dns_records(updated_at);

-- IP History table (keeps last 250 entries per user)
CREATE TABLE IF NOT EXISTS ip_history (
    id SERIAL PRIMARY KEY,
    afterdark_login VARCHAR(255) NOT NULL,
    domain VARCHAR(255) NOT NULL,
    ipv4 INET,
    ipv6 INET,
    changed_at BIGINT NOT NULL, -- Unix timestamp
    change_type VARCHAR(20), -- 'ipv4_change', 'ipv6_change', 'both_change'
    FOREIGN KEY (afterdark_login, domain) REFERENCES dns_records(afterdark_login, domain) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_history_user ON ip_history(afterdark_login);
CREATE INDEX IF NOT EXISTS idx_history_domain ON ip_history(domain);
CREATE INDEX IF NOT EXISTS idx_history_changed_at ON ip_history(changed_at);

-- API Keys table for authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    afterdark_login VARCHAR(255) NOT NULL UNIQUE,
    api_key VARCHAR(64) NOT NULL UNIQUE,
    is_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_api_key ON api_keys(api_key);

-- Function to maintain history limit (250 entries per user)
CREATE OR REPLACE FUNCTION cleanup_ip_history()
RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM ip_history
    WHERE afterdark_login = NEW.afterdark_login
    AND id NOT IN (
        SELECT id FROM ip_history
        WHERE afterdark_login = NEW.afterdark_login
        ORDER BY changed_at DESC
        LIMIT 250
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to cleanup old history after insert
CREATE TRIGGER trigger_cleanup_history
AFTER INSERT ON ip_history
FOR EACH ROW
EXECUTE FUNCTION cleanup_ip_history();

-- Function to log IP changes
CREATE OR REPLACE FUNCTION log_ip_change()
RETURNS TRIGGER AS $$
DECLARE
    change_detected VARCHAR(20);
BEGIN
    -- Determine what changed
    IF (OLD.current_ipv4 IS DISTINCT FROM NEW.current_ipv4) AND
       (OLD.current_ipv6 IS DISTINCT FROM NEW.current_ipv6) THEN
        change_detected := 'both_change';
    ELSIF (OLD.current_ipv4 IS DISTINCT FROM NEW.current_ipv4) THEN
        change_detected := 'ipv4_change';
    ELSIF (OLD.current_ipv6 IS DISTINCT FROM NEW.current_ipv6) THEN
        change_detected := 'ipv6_change';
    ELSE
        RETURN NEW; -- No IP change, skip logging
    END IF;

    -- Insert into history
    INSERT INTO ip_history (afterdark_login, domain, ipv4, ipv6, changed_at, change_type)
    VALUES (NEW.afterdark_login, NEW.domain, NEW.current_ipv4, NEW.current_ipv6, NEW.updated_at, change_detected);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log IP changes on update
CREATE TRIGGER trigger_log_ip_change
AFTER UPDATE ON dns_records
FOR EACH ROW
EXECUTE FUNCTION log_ip_change();
