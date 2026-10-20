import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { canonicalJson } from '../shared/format.ts';
import type { Signer } from '../shared/runner.ts';
import type { Contract, GauntletEvent } from '../shared/types.ts';

export interface Escrow extends Signer {
  kid: string;
  jwk: Record<string, unknown>;
  verify(contract: Contract, signature: string): boolean;
  /** sign an already-final contract (used to re-sign bundled replays with this server's key) */
  signSync(contract: Contract): string;
}

/** Load ESCROW_PRIVATE_KEY (PEM or base64 PEM), else a key persisted in DATA_DIR, else a new one. */
function loadKey(dataDir: string, envKey: string | null): crypto.KeyObject {
  if (envKey) {
    const pem = envKey.includes('BEGIN') ? envKey.replace(/\\n/g, '\n') : Buffer.from(envKey, 'base64').toString('utf8');
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

/** Hash of the negotiation transcript the contract came out of. */
export function transcriptHash(events: GauntletEvent[]): string {
  const relevant = events
    .filter((e) => e.type === 'vendor.offer' || e.type === 'buyer.decision' || e.type === 'contract.proposed' || e.type === 'contract.reviewed')
    .map(({ t: _t, ...rest }) => rest);
  return crypto.createHash('sha256').update(canonicalJson(relevant)).digest('hex');
}

export function createEscrow(dataDir: string, envKey: string | null): Escrow {
  const privateKey = loadKey(dataDir, envKey);
  const publicKey = crypto.createPublicKey(privateKey);
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  const kid = crypto.createHash('sha256').update(String(jwk.x)).digest('hex').slice(0, 16);
  return {
    kid,
    jwk,
    async sign(contract, events) {
      const withHash: Contract = { ...contract, transcriptHash: transcriptHash(events) };
      const signature = crypto.sign(null, Buffer.from(canonicalJson(withHash)), privateKey).toString('base64');
      return { contract: withHash, signature, kid };
    },
    signSync(contract) {
      return crypto.sign(null, Buffer.from(canonicalJson(contract)), privateKey).toString('base64');
    },
    verify(contract, signature) {
      try {
        return crypto.verify(null, Buffer.from(canonicalJson(contract)), publicKey, Buffer.from(signature, 'base64'));
      } catch {
        return false;
      }
    },
  };
}
