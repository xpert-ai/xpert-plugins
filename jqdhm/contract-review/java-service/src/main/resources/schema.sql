CREATE TABLE IF NOT EXISTS contracts (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(128) NOT NULL,
    organization_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    assistant_id VARCHAR(128) NOT NULL,
    request_key VARCHAR(128) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    title VARCHAR(120) NOT NULL,
    source_text CLOB NOT NULL,
    fields_json CLOB NOT NULL,
    status VARCHAR(16) NOT NULL CHECK (status IN ('DRAFT', 'CONFIRMED')),
    version BIGINT NOT NULL CHECK (version > 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    audit_json CLOB NOT NULL,
    CONSTRAINT contracts_scope_request_unique UNIQUE (tenant_id, organization_id, user_id, assistant_id, request_key)
);
CREATE INDEX IF NOT EXISTS contracts_scope_updated ON contracts (tenant_id, organization_id, user_id, assistant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS contract_extraction_requests (
    tenant_id VARCHAR(128) NOT NULL,
    organization_id VARCHAR(128) NOT NULL,
    user_id VARCHAR(128) NOT NULL,
    assistant_id VARCHAR(128) NOT NULL,
    request_key VARCHAR(128) NOT NULL,
    original_hash VARCHAR(64) NOT NULL,
    contract_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (tenant_id, organization_id, user_id, assistant_id, request_key),
    CONSTRAINT extraction_request_contract_fk FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE
);
