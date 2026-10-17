-- Migration 092: WebAuthn credentials

CREATE TABLE IF NOT EXISTS webauthn_credentials (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  credential_id bytea NOT NULL,
  public_key text NOT NULL,
  sign_count bigint DEFAULT 0,
  transports text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webauthn_profile_id ON webauthn_credentials(profile_id);
