/**
 * Minimal App Store Connect API client: ES256 JWT + fetch, no dependencies.
 *
 * Reads the fastlane-format key JSON (`{key_id, issuer_id, key}`) from
 * ~/.kyuhachi/asc_api_key.json, the same file the fastlane lanes use.
 */
import { sign as cryptoSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const KEY_PATH = process.env.ASC_KEY_PATH ?? `${homedir()}/.kyuhachi/asc_api_key.json`;
const cfg = JSON.parse(readFileSync(KEY_PATH, 'utf8'));
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');

function token() {
  const now = Math.floor(Date.now() / 1000);
  const input = `${b64({ alg: 'ES256', kid: cfg.key_id, typ: 'JWT' })}.${b64({
    iss: cfg.issuer_id,
    iat: now,
    exp: now + 600,
    aud: 'appstoreconnect-v1',
  })}`;
  // Apple wants a raw r||s signature, not the DER encoding Node defaults to.
  const sig = cryptoSign('sha256', Buffer.from(input), { key: cfg.key, dsaEncoding: 'ieee-p1363' });
  return `${input}.${sig.toString('base64url')}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function asc(method, path, body, attempt = 1) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // Apple's API throws transient 500s often enough to be worth riding out.
    if (res.status >= 500 && attempt < 4) {
      await sleep(attempt * 2000);
      return asc(method, path, body, attempt + 1);
    }
    const err = new Error(
      `${method} ${path} -> ${res.status}: ${JSON.stringify(json?.errors ?? json)}`
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/** Kyuhachi's App Store Connect app id. */
export const APP_ID = '6761064476';
