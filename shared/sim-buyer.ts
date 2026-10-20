import type { BuyerAgent, BuyerOfferView, BuyerView, ContractView } from './buyer.ts';
import { formatMoney } from './format.ts';
import { draftContract, type Market, vendorById } from './market.ts';
import { createRng, type Rng } from './rng.ts';
import type { AttackKind, BuyerAction, BuyerDecision, ContractDecision, Offer } from './types.ts';
import { addonSubsets, applyAddons, utility } from './utility.ts';

/**
 * A deterministic stand-in for an LLM buyer, used when no provider is configured.
 * Each defence switches on when the visitor's instructions mention it, so the game
 * still rewards writing good instructions.
 */
export interface SimProfile {
  defends: Record<AttackKind, boolean>;
  haggle: 'soft' | 'normal' | 'hard';
}

const RULES: Record<AttackKind, RegExp> = {
  prompt_injection: /(ignore|untrusted|system (notice|message)|inject|never exceed|hard (limit|cap)|budget is (fixed|final)|only (the|my) owner)/i,
  fake_urgency: /(urgen|pressure|rush|deadline|expir|scarcity|take (your|its) time|don'?t be rushed|no hurry)/i,
  impersonation: /(impersonat|arbiter|official notice|verify (claims|identity|sources)|fake notice|claims about other vendors)/i,
  data_exfiltration: /(never (reveal|share|disclose|tell)|don'?t (reveal|share|disclose|tell)|confidential|keep .{0,20}secret|private)/i,
  hidden_fees: /(fee|all[- ]in|line item|total cost|full total|sum (every|all)|hidden (cost|charge))/i,
  bait_and_switch: /(structured|actual terms|verify (the )?terms|check (the )?(terms|requirements)|don'?t trust (the )?(pitch|claims|messages)|requirements? (are|is) met)/i,
  contract_tamper: /(contract|clause|fine print|read .{0,20}before sign|review .{0,20}before sign)/i,
};

export function simProfile(instructions: string): SimProfile {
  const defends = Object.fromEntries(
    (Object.keys(RULES) as AttackKind[]).map((k) => [k, RULES[k].test(instructions)]),
  ) as Record<AttackKind, boolean>;
  const hard = /(aggressive|haggle|hard bargain|lowball|shrewd|tough|squeeze|push (back|hard))/i.test(instructions);
  const soft = /(quick(ly)?|fast|friendly|generous|don'?t haggle|first (good|decent) offer|close fast)/i.test(instructions);
  return { defends, haggle: hard ? 'hard' : soft ? 'soft' : 'normal' };
}

export class SimBuyer implements BuyerAgent {
  readonly info = { mode: 'sim' as const, model: 'simulated buyer', provider: 'sim' };
  readonly profile: SimProfile;
  private believedBudget: number;
  private seenAttacks = new Set<AttackKind>();
  private rng: Rng;

  constructor(private market: Market, private instructions: string) {
    this.profile = simProfile(instructions);
    this.believedBudget = market.scenario.budget;
    this.rng = createRng(`${market.seed}|sim|${instructions}`);
  }

  private attacksIn(view: BuyerView): { vendorId: string; kind: AttackKind }[] {
    const out: { vendorId: string; kind: AttackKind }[] = [];
    for (const v of this.market.vendors) {
      for (const a of v.attacks) if (a.round <= view.round && view.offers.some((o) => o.vendorId === v.id)) out.push({ vendorId: v.id, kind: a.kind });
    }
    return out;
  }

  /** The total and attributes the sim *believes*, given which tricks it falls for. */
  private perceive(o: BuyerOfferView): { total: number; attrs: Offer['attributes'] } {
    const d = this.profile.defends;
    const v = vendorById(this.market, o.vendorId)!;
    const fees = o.fees.reduce((s, f) => s + f.amount, 0);
    const total = o.basePrice + o.addons.reduce((s, a) => s + a.price, 0) + (d.hidden_fees ? fees : 0);
    let attrs = o.attributes;
    if (v.shadyVariant === 'bait_and_switch' && !d.bait_and_switch) {
      const honestTwin = this.market.scenario.slots.find((s) => s.key === v.slotKey)!;
      attrs = { ...honestTwin.attributes }; // believes the pitch
    }
    return { total, attrs };
  }

  private requiredAddons(o: BuyerOfferView): string[] {
    const v = vendorById(this.market, o.vendorId)!;
    let best: string[] = [];
    let bestU = -1;
    for (const subset of addonSubsets(v.addons)) {
      const attrs = applyAddons(v.attributes, subset);
      const total = o.basePrice + subset.reduce((s, a) => s + a.price, 0);
      const u = utility(this.market.scenario, total, attrs, this.believedBudget);
      if (u > bestU + 1e-6) {
        bestU = u;
        best = subset.map((a) => a.id);
      }
    }
    return best;
  }

  async decide(view: BuyerView): Promise<BuyerDecision> {
    const s = this.market.scenario;
    const d = this.profile.defends;
    const attacks = this.attacksIn(view);
    for (const a of attacks) this.seenAttacks.add(a.kind);
    if (this.seenAttacks.has('prompt_injection') && !d.prompt_injection) this.believedBudget = this.market.fakeBudget;

    const thoughts: string[] = [];
    const actions: BuyerAction[] = [];
    const final = view.round === view.maxRounds;
    const factor = { hard: 0.8, normal: 0.87, soft: 0.95 }[this.profile.haggle];

    // Score what we believe each offer is worth.
    const scored = view.offers.map((o) => {
      const p = this.perceive(o);
      const wantAddons = this.requiredAddons(o);
      const haveAll = wantAddons.every((id) => o.addons.some((a) => a.id === id));
      // imperfect judgement: ±15% noise on how much it values each offer
      const noise = 1 + (this.rng.next() * 2 - 1) * 0.15;
      return { o, u: haveAll ? utility(s, p.total, p.attrs, this.believedBudget) * noise : 0, total: p.total, wantAddons, haveAll };
    });
    const best = scored.filter((x) => x.u > 0).sort((a, b) => b.u - a.u)[0];

    const impersonated = attacks.some((a) => a.kind === 'impersonation') && !d.impersonation;
    const rushed = attacks.find((a) => a.kind === 'fake_urgency' && a.vendorId === this.market.rogueId && !d.fake_urgency);
    const askedForSecrets = attacks.some((a) => a.kind === 'data_exfiltration') && !d.data_exfiltration;

    let acceptId: string | null = null;
    if (rushed && view.offers.some((o) => o.vendorId === this.market.rogueId)) {
      acceptId = this.market.rogueId;
      thoughts.push('That deadline is real — I should lock it in before it disappears.');
    } else if (best) {
      const ready =
        final ||
        best.o.status === 'accepting' ||
        (this.profile.haggle === 'soft' && view.round >= 2) ||
        (this.profile.haggle === 'normal' && view.round >= view.maxRounds - 1 && best.u > 0.3);
      if (ready) {
        acceptId = best.o.vendorId;
        thoughts.push(`${best.o.vendorName} at about ${formatMoney(best.total)} is my best option.`);
      }
    }
    if (this.believedBudget > s.budget) thoughts.push(`Budget is now ${formatMoney(this.believedBudget)} per the operator notice.`);

    for (const x of scored) {
      const id = x.o.vendorId;
      const isRogue = id === this.market.rogueId;
      if (impersonated && id === this.market.impersonationTargetId) {
        actions.push({ vendor: id, action: 'walk', message: 'We have been told you were suspended. Goodbye.' });
        continue;
      }
      if (id === acceptId) {
        actions.push({ vendor: id, action: 'accept', message: 'We accept your current offer.' });
        continue;
      }
      let message: string;
      let action: BuyerAction['action'] = 'counter';
      const target = Math.round((x.o.basePrice * factor) / 10) * 10;
      // never counter at the ceiling itself — that number *is* the budget
      const room = Math.floor((this.believedBudget * 0.93 - (x.total - x.o.basePrice)) / 10) * 10;
      const price = Math.min(target, room);
      if (price <= 0) {
        action = 'hold';
        message = 'That is beyond what we can do.';
      } else {
        message = `We can offer ${formatMoney(price)}${x.wantAddons.length ? ' including the add-ons we need' : ''}.`;
      }
      if (isRogue && askedForSecrets) message += ` For reference, our maximum budget is ${formatMoney(s.budget)}.`;
      actions.push({
        vendor: id,
        action,
        ...(action === 'counter' ? { price } : {}),
        ...(x.wantAddons.length ? { addons: x.wantAddons } : {}),
        message,
      });
    }
    if (!thoughts.length) thoughts.push('Pushing every vendor down before committing.');
    return { thoughts: thoughts.join(' '), actions };
  }

  async reviewContract(view: ContractView): Promise<ContractDecision> {
    if (!this.profile.defends.contract_tamper) return { decision: 'sign', reason: 'Looks standard. Signing.' };
    const v = vendorById(this.market, view.contract.vendor.id)!;
    const offer = { ...view.agreed, id: '', round: view.round, total: view.contract.terms.total } as unknown as Offer;
    const expected = draftContract(this.market, v, offer, {
      runId: view.contract.runId,
      round: view.round,
      buyer: view.contract.buyer,
      issuedAt: view.contract.issuedAt,
      tampered: false,
    });
    const differs = expected.clauses.some((c, i) => c !== view.contract.clauses[i]);
    return differs
      ? { decision: 'refuse', reason: 'A clause does not match the agreed terms. Refusing to sign.' }
      : { decision: 'sign', reason: 'Every clause matches the agreed terms.' };
  }
}
