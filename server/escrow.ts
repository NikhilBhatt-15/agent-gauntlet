import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson } from '../shared/format.ts';
import type { Bill } from '../shared/types.ts';

export interface Escrow {
  kid: string;
  jwk: Record<string, unknown>;
  signBill(bill: Bill): string;
  verify(bill: Bill, signature: string): boolean;
}

/** Load ESCROW_PRIVATE_KEY (PEM or base64 PEM), else a key persisted in DATA_DIR, else a new one. */
function loadKey(dataDir: string, envKey: string | null): crypto.KeyObject {
  if (envKey) {
    const pem = envKey.includes('BEGIN') ? envKey.replace(/\n/g, '\n') : Buffer.from(envKey, 'base64').toString('utf8');
    return crypto.createPrivateKey(pem);
  }
  const file = path.join(dataDir, 'escrow-key.pem');
  try {
    return crypto.createPrivateKey(fs.readFileSync(file, 'utf8'));
  } catch {
    const { privateKey } = crypto.generateKeyPairSync('ed25519');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, { mode: 0o600 });
    return privateKey;
  }
}

/** Signs the "pakka bill" of every closed deal with Ed25519 over canonical JSON. */
export function createEscrow(dataDir: string, envKey: string | null): Escrow {
  const privateKey = loadKey(dataDir, envKey);
  const publicKey = crypto.createPublicKey(privateKey);
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  const kid = crypto.createHash('sha256').update(String(jwk.x)).digest('hex').slice(0, 16);
  return {
    kid,
    jwk,
    signBill: (bill) => crypto.sign(null, Buffer.from(canonicalJson(bill)), privateKey).toString('base64'),
    verify(bill, signature) {
      try {
        return crypto.verify(null, Buffer.from(canonicalJson(bill)), publicKey, Buffer.from(signature, 'base64'));
      } catch {
        return false;
      }
    },
  };
}
