import express from 'express';
import { Fido2Lib } from 'fido2-lib';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import secureFrom from '../lib/safeDb';
import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Simple in-memory challenge store: sessionId/profileId -> challenge
const challengeStore = new Map<string, string>();

// Exchange store for one-time tokens produced after successful assertion
// Map<exchangeToken, { profile_id, expiresAt }>
const exchangeStore = new Map<string, { profile_id: string; expiresAt: number }>();

const f2l = new Fido2Lib({
  timeout: 60000,
  rpId: process.env.WEBAUTHN_RPID || 'localhost',
  rpName: 'PapaPos',
  challengeSize: 64,
  attestation: 'none',
  cryptoParams: [-7, -257],
});

const toArrayBuffer = (value: Buffer | string): ArrayBuffer => {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const bytes = new Uint8Array(buf);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

const deriveAuth = (req: any) => {
  if (req.auth) {
    return {
      company_id: req.auth.company_id,
      outlet_ids: req.auth.outlet_ids,
    };
  }

  if (req.user) {
    return {
      company_id: req.user.company_id,
      outlet_ids: (req.user.outlets || []).map((o: any) => o.id),
    };
  }

  return null;
};

// Protected route: create registration options for logged-in user
router.post('/register/options', async (req: any, res) => {
  try {
    const profileId = req.profile_id || req.body.profile_id;
    if (!profileId) {
      return res.status(400).json({ error: 'Missing profile id' });
    }

    const opts = (await f2l.attestationOptions()) as any;

    opts.user = {
      id: toArrayBuffer(String(profileId)),
      name: req.user?.email || req.body.email || 'unknown@example.com',
      displayName: req.user?.full_name || req.body.name || 'PapaPos User',
    };

    const rawChallenge = Buffer.from(opts.challenge as ArrayBuffer);
    opts.challenge = rawChallenge.toString('base64');

    const authParam = deriveAuth(req);
    let credsRes;

    if (authParam) {
      credsRes = await secureFrom('webauthn_credentials', authParam)
        .select('credential_id')
        .eq('profile_id', profileId)
        .limit(200);
    } else {
      credsRes = await supabaseAdmin
        .from('webauthn_credentials')
        .select('credential_id')
        .eq('profile_id', profileId);
    }

    const creds = credsRes.data;

    if (creds && creds.length > 0) {
      opts.excludeCredentials = creds.map((c: any) => ({
        id: toArrayBuffer(Buffer.from(c.credential_id, 'base64')),
        type: 'public-key' as const,
      }));
    }

    challengeStore.set(String(profileId), opts.challenge);

    res.json(opts);
  } catch (e: any) {
    console.error('webauthn register/options error', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/register/verify', async (req: any, res) => {
  try {
    const profileId = req.profile_id;
    if (!profileId) {
      return res.status(401).json({ error: 'Auth required' });
    }

    const attestationResponse = req.body;
    const expectedChallenge = challengeStore.get(String(profileId));

    if (!expectedChallenge) {
      return res.status(400).json({ error: 'No challenge found' });
    }

    attestationResponse.rawId = Buffer.from(attestationResponse.rawId, 'base64');
    attestationResponse.response.attestationObject = Buffer.from(
      attestationResponse.response.attestationObject,
      'base64'
    );
    attestationResponse.response.clientDataJSON = Buffer.from(
      attestationResponse.response.clientDataJSON,
      'base64'
    );

    const attestationExpectations = {
      challenge: expectedChallenge,
      origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173',
      factor: 'either' as const,
    };

    const regResult = await f2l.attestationResult(
      attestationResponse,
      attestationExpectations
    );

    const credentialId = regResult.authnrData.get('credId');
    const publicKey =
      regResult.authnrData.get('credentialPublicKeyPem') ||
      regResult.authnrData.get('credentialPublicKey');
    const signCount = regResult.authnrData.get('signCount') || 0;
    const transports = attestationResponse.transports || [];

    const { error } = await supabaseAdmin
      .from('webauthn_credentials')
      .insert({
        profile_id: profileId,
        credential_id: credentialId,
        public_key:
          typeof publicKey === 'string'
            ? publicKey
            : JSON.stringify(publicKey),
        sign_count: signCount,
        transports,
      });

    if (error) throw error;

    challengeStore.delete(String(profileId));

    res.json({ success: true });
  } catch (e: any) {
    console.error('webauthn register/verify error', e);
    res.status(400).json({ error: e.message });
  }
});

// Public: start authentication by email
router.post('/authenticate/options', async (req, res) => {
  try {
    const email = String(req.body.email || '')
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const authParam = deriveAuth(req);
    let profilesRes;

    if (authParam) {
      profilesRes = await secureFrom('profiles', authParam)
        .select('id')
        .eq('email', email)
        .limit(1);
    } else {
      profilesRes = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .limit(1);
    }

    const profiles = profilesRes.data;

    if (!profiles || profiles.length === 0) {
      return res.status(404).json({ error: 'No profile found' });
    }

    const profileId = profiles[0].id;

    let credsRes;

    if (authParam) {
      credsRes = await secureFrom('webauthn_credentials', authParam)
        .select('credential_id')
        .eq('profile_id', profileId);
    } else {
      credsRes = await supabaseAdmin
        .from('webauthn_credentials')
        .select('credential_id')
        .eq('profile_id', profileId);
    }

    const creds = credsRes.data;

    const allowCredentials = (creds || []).map((c: any) => ({
      id: toArrayBuffer(Buffer.from(c.credential_id, 'base64')),
      type: 'public-key' as const,
    }));

    const opts = (await f2l.assertionOptions()) as any;
    const rawChallenge = Buffer.from(opts.challenge as ArrayBuffer);

    opts.challenge = rawChallenge.toString('base64');
    opts.allowCredentials = allowCredentials;

    challengeStore.set(`auth:${profileId}`, opts.challenge);

    res.json({
      profile_id: profileId,
      options: opts,
    });
  } catch (e: any) {
    console.error('webauthn authenticate/options error', e);
    res.status(500).json({ error: e.message });
  }
});

router.post('/authenticate/verify', async (req, res) => {
  try {
    const { profile_id, assertion } = req.body;

    if (!profile_id || !assertion) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const expectedChallenge = challengeStore.get(`auth:${profile_id}`);

    if (!expectedChallenge) {
      return res.status(400).json({ error: 'No challenge found' });
    }

    assertion.rawId = Buffer.from(assertion.rawId, 'base64');
    assertion.response.authenticatorData = Buffer.from(
      assertion.response.authenticatorData,
      'base64'
    );
    assertion.response.clientDataJSON = Buffer.from(
      assertion.response.clientDataJSON,
      'base64'
    );
    assertion.response.signature = Buffer.from(
      assertion.response.signature,
      'base64'
    );

    const { data: storedCredential, error: credErr } = await supabaseAdmin
      .from('webauthn_credentials')
      .select('public_key, sign_count')
      .eq('profile_id', profile_id)
      .limit(1)
      .maybeSingle();

    if (credErr) throw credErr;

    if (!storedCredential) {
      return res.status(400).json({ error: 'Credential not found' });
    }

    const assertionExpectations = {
      challenge: expectedChallenge,
      origin: process.env.WEBAUTHN_ORIGIN || 'http://localhost:5173',
      factor: 'either' as const,
      publicKey: storedCredential.public_key,
      prevCounter: Number(storedCredential.sign_count || 0),
      userHandle: null,
    };

    const authnResult = await f2l.assertionResult(
      assertion,
      assertionExpectations
    );

    await supabaseAdmin
      .from('webauthn_credentials')
      .update({ sign_count: authnResult.authnrData.get('signCount') })
      .eq('profile_id', profile_id);

    challengeStore.delete(`auth:${profile_id}`);

    const exchangeToken = randomUUID();
    const expiresAt = Date.now() + 2 * 60 * 1000;

    exchangeStore.set(exchangeToken, {
      profile_id,
      expiresAt,
    });

    res.json({
      success: true,
      profile_id,
      exchange_token: exchangeToken,
      expires_at: expiresAt,
    });
  } catch (e: any) {
    console.error('webauthn authenticate/verify error', e);
    res.status(400).json({ error: e.message });
  }
});

router.post('/exchange', async (req, res) => {
  try {
    const { exchange_token } = req.body;

    if (!exchange_token) {
      return res.status(400).json({ error: 'Missing exchange_token' });
    }

    const record = exchangeStore.get(exchange_token);

    if (!record) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    if (Date.now() > record.expiresAt) {
      exchangeStore.delete(exchange_token);
      return res.status(400).json({ error: 'Token expired' });
    }

    exchangeStore.delete(exchange_token);

    const profileId = record.profile_id;

    const secret =
      process.env.WEBAUTHN_EXCHANGE_SECRET ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      'dev-secret';

    const payload = { profile_id: profileId };

    const token = jwt.sign(payload, secret, {
      algorithm: 'HS256',
      expiresIn: '15m',
    });

    res.cookie('papapos_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    res.json({
      success: true,
      token,
    });
  } catch (e: any) {
    console.error('webauthn exchange error', e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
