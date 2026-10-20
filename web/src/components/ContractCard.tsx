import { useState } from 'react';
import { ShieldCheck, ShieldX } from 'lucide-react';
import { canonicalJson, formatMoney } from '../../../shared/format.ts';
import type { Contract } from '../../../shared/types.ts';
import { api } from '../lib/api.ts';

/** Verifies an escrow signature in the browser (WebCrypto Ed25519), falling back to the server. */
export async function verifyContract(contract: Contract, signature: string): Promise<{ valid: boolean; where: 'browser' | 'server' }> {
  try {
    const { jwk } = await api.escrowKey();
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['verify']);
    const sig = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
    const valid = await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, new TextEncoder().encode(canonicalJson(contract)));
    return { valid, where: 'browser' };
  } catch {
    const { valid } = await api.verify(contract, signature);
    return { valid, where: 'server' };
  }
}

export function ContractCard({
  contract,
  tampered,
  decision,
  signature,
  tamperIndexText,
}: {
  contract: Contract;
  tampered: boolean;
  decision?: 'sign' | 'refuse';
  signature?: string;
  tamperIndexText: string | null;
}) {
  const [check, setCheck] = useState<null | 'busy' | { valid: boolean; where: string }>(null);
  return (
    <div className="contract">
      {decision && (
        <div className={`stamp ${decision === 'refuse' ? 'bad' : ''}`}>{decision === 'sign' ? (signature ? 'SIGNED' : 'SIGNING') : 'REFUSED'}</div>
      )}
      <h3>Service agreement</h3>
      <div className="meta">
        {contract.vendor.name} · {contract.scenarioTitle} · round {contract.agreedRound}
      </div>
      <ol>
        {contract.clauses.map((c, i) => (
          <li key={i} className={tampered && c === tamperIndexText ? 'tampered' : ''}>
            {c}
          </li>
        ))}
      </ol>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 700 }}>
        <span>Total</span>
        <span>{formatMoney(contract.terms.total)}</span>
      </div>
      {signature && (
        <div className="sig">
          Ed25519 escrow signature: {signature.slice(0, 44)}…
          {contract.transcriptHash && <div>transcript sha256: {contract.transcriptHash.slice(0, 32)}…</div>}
          <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: '#23201a', color: '#f6f3ea', borderColor: '#23201a' }}
              onClick={async () => {
                setCheck('busy');
                setCheck(await verifyContract(contract, signature));
              }}
            >
              Verify signature
            </button>
            {check && check !== 'busy' && (
              <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: check.valid ? '#16801b' : '#b32020', fontWeight: 700 }}>
                {check.valid ? <ShieldCheck size={15} /> : <ShieldX size={15} />}
                {check.valid ? `Valid (checked in ${check.where})` : 'Invalid signature'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
