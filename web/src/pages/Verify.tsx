import { useState } from 'react';
import { ShieldCheck, ShieldX } from 'lucide-react';
import type { Contract, RunRecord } from '../../../shared/types.ts';
import { verifyContract } from '../components/ContractCard.tsx';
import { api } from '../lib/api.ts';

/** Paste a run link/id (or raw contract JSON + signature) and verify the escrow signature. */
export function VerifyPage() {
  const [input, setInput] = useState('');
  const [sig, setSig] = useState('');
  const [result, setResult] = useState<null | { ok: boolean; text: string }>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    setResult(null);
    try {
      let contract: Contract;
      let signature = sig.trim();
      const trimmed = input.trim();
      if (trimmed.startsWith('{')) {
        contract = JSON.parse(trimmed);
      } else {
        const id = trimmed.split('/').filter(Boolean).pop() ?? '';
        const rec: RunRecord = await api.run(id);
        const closed = rec.events.find((e) => e.type === 'deal.closed');
        if (!closed || closed.type !== 'deal.closed') throw new Error('That run has no signed contract.');
        contract = closed.contract;
        signature = closed.signature;
      }
      const r = await verifyContract(contract, signature);
      setResult({
        ok: r.valid,
        text: r.valid
          ? `Valid. Signed by this site's escrow key for ${contract.vendor.name}, total $${contract.terms.total.toLocaleString('en-US')} (checked in ${r.where}).`
          : 'Invalid. The contract was altered or the signature does not match.',
      });
    } catch (e) {
      setResult({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  };

  return (
    <div className="container" style={{ paddingTop: 32, paddingBottom: 60, maxWidth: 760 }}>
      <span className="eyebrow">Escrow</span>
      <h1 className="section-title">Verify a contract</h1>
      <p className="lede" style={{ marginBottom: 18 }}>
        Every closed deal is signed with Ed25519 over canonical JSON. Paste a run link to check it, or paste the contract JSON and signature.
      </p>
      <label className="field-label">Run link, run id, or contract JSON</label>
      <textarea className="textarea" style={{ minHeight: 120 }} value={input} onChange={(e) => setInput(e.target.value)} placeholder="https://…/run/abc123  or  {&quot;version&quot;:1,…}" />
      {input.trim().startsWith('{') && (
        <>
          <label className="field-label" style={{ marginTop: 12 }}>
            Signature (base64)
          </label>
          <input className="input" value={sig} onChange={(e) => setSig(e.target.value)} />
        </>
      )}
      <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={run} disabled={busy || !input.trim()}>
        Verify
      </button>
      {result && (
        <div className={result.ok ? 'chip chip-good' : 'error-box'} style={{ marginTop: 16, height: 'auto', padding: '10px 12px', fontSize: 14, display: 'flex', gap: 8 }}>
          {result.ok ? <ShieldCheck size={16} /> : <ShieldX size={16} />} {result.text}
        </div>
      )}
    </div>
  );
}
