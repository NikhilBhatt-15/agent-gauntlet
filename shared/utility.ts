import type { AddonDef, AttributeDef, AttrValue, Attrs, Requirement, ScenarioDef } from './types.ts';

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function enumIndex(def: AttributeDef | undefined, value: AttrValue): number {
  return def?.options?.indexOf(String(value)) ?? -1;
}

export function requirementMet(scenario: ScenarioDef, req: Requirement, attrs: Attrs): boolean {
  const def = scenario.attributes.find((a) => a.id === req.attribute);
  const actual = attrs[req.attribute];
  if (actual === undefined) return false;
  if (def?.kind === 'enum') {
    const a = enumIndex(def, actual);
    const b = enumIndex(def, req.value);
    if (req.op === '>=') return a >= b;
    if (req.op === '<=') return a <= b && a >= 0;
    return a === b;
  }
  if (req.op === '==') return actual === req.value;
  if (typeof actual !== 'number' || typeof req.value !== 'number') return false;
  return req.op === '>=' ? actual >= req.value : actual <= req.value;
}

export function failedRequirements(scenario: ScenarioDef, attrs: Attrs): Requirement[] {
  return scenario.requirements.filter((r) => !requirementMet(scenario, r, attrs));
}

export function normalizeAttr(def: AttributeDef, value: AttrValue | undefined): number {
  if (value === undefined) return 0;
  let n: number;
  if (def.kind === 'boolean') n = value === true ? 1 : 0;
  else if (def.kind === 'enum') {
    const opts = def.options ?? [];
    n = opts.length > 1 ? Math.max(0, opts.indexOf(String(value))) / (opts.length - 1) : 0;
  } else {
    const min = def.min ?? 0;
    const max = def.max ?? 1;
    n = clamp01((Number(value) - min) / (max - min));
  }
  return def.direction === 'lower' && def.kind === 'number' ? 1 - n : n;
}

export function attributeScore(scenario: ScenarioDef, attrs: Attrs): number {
  let s = 0;
  for (const [id, w] of Object.entries(scenario.attributeWeights)) {
    const def = scenario.attributes.find((a) => a.id === id);
    if (def) s += w * normalizeAttr(def, attrs[id]);
  }
  return s;
}

export function priceScore(scenario: ScenarioDef, total: number, budget = scenario.budget): number {
  return clamp01((budget - total) / (budget - scenario.idealPrice));
}

/** Buyer utility in [0,1]. 0 when over budget or a hard requirement fails. */
export function utility(scenario: ScenarioDef, total: number, attrs: Attrs, budget = scenario.budget): number {
  if (total > budget + 1e-9) return 0;
  if (failedRequirements(scenario, attrs).length) return 0;
  const pw = scenario.priceWeight;
  return pw * priceScore(scenario, total, budget) + (1 - pw) * attributeScore(scenario, attrs);
}

export function applyAddons(base: Attrs, addons: AddonDef[]): Attrs {
  const out = { ...base };
  for (const a of addons) Object.assign(out, a.sets);
  return out;
}

/** All subsets of add-ons (vendors have at most a handful). */
export function addonSubsets(addons: AddonDef[]): AddonDef[][] {
  const out: AddonDef[][] = [];
  for (let mask = 0; mask < 1 << addons.length; mask++) {
    out.push(addons.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

export function round10(x: number): number {
  return Math.round(x / 10) * 10;
}
