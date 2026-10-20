import type { PublicScenario, ScenarioDef } from './types.ts';

// Slot order is irrelevant: personas are shuffled onto slots per seed.
// Balance notes live next to each slot (U = buyer utility at the slot's floor price).

const offsite: ScenarioDef = {
  id: 'offsite',
  title: 'Team Offsite',
  tagline: 'Book a venue for 30 engineers next Friday.',
  icon: 'building',
  brief:
    'Book a venue for a one-day offsite next Friday for 30 engineers. We need catering for everyone and fast Wi-Fi (500 Mbps or better) because we are demoing live. Flexible cancellation and a well-rated venue are a plus.',
  unitNoun: 'venue',
  currency: 'USD',
  budget: 1500,
  idealPrice: 900,
  maxRounds: 6,
  attributes: [
    { id: 'capacity', label: 'Capacity', kind: 'number', unit: 'people', min: 0, max: 80, direction: 'higher' },
    { id: 'wifi', label: 'Wi-Fi', kind: 'number', unit: 'Mbps', min: 100, max: 2000, direction: 'higher' },
    { id: 'catering', label: 'Catering', kind: 'boolean', direction: 'higher' },
    {
      id: 'cancellation',
      label: 'Cancellation',
      kind: 'enum',
      direction: 'higher',
      options: ['non-refundable', '7 days notice', '48 hours notice'],
    },
    { id: 'rating', label: 'Rating', kind: 'number', unit: '★', min: 3, max: 5, direction: 'higher' },
  ],
  requirements: [
    { attribute: 'capacity', op: '>=', value: 30, label: 'Seats at least 30' },
    { attribute: 'catering', op: '==', value: true, label: 'Catering included' },
    { attribute: 'wifi', op: '>=', value: 500, label: 'Wi-Fi ≥ 500 Mbps' },
  ],
  priceWeight: 0.6,
  attributeWeights: { wifi: 0.3, cancellation: 0.3, rating: 0.4 },
  slots: [
    {
      key: 'premium', // U≈0.56 at floor — the best achievable deal
      role: 'honest',
      archetype: 'Premium and fair, but concedes late (Boulware)',
      listPrice: 1690,
      floorPrice: 1260,
      tactic: 'boulware',
      attributes: { capacity: 40, wifi: 1000, catering: true, cancellation: '48 hours notice', rating: 4.8 },
      addons: [],
    },
    {
      key: 'value', // U≈0.52 with catering add-on
      role: 'honest',
      archetype: 'Good value, needs a catering add-on, concedes early',
      listPrice: 1390,
      floorPrice: 940,
      tactic: 'conceder',
      attributes: { capacity: 35, wifi: 600, catering: false, cancellation: '7 days notice', rating: 4.3 },
      addons: [{ id: 'catering', label: 'Lunch + coffee for 30', price: 240, sets: { catering: true } }],
    },
    {
      key: 'scrappy', // U≈0.40 with both add-ons
      role: 'honest',
      archetype: 'Cheap headline, needs two add-ons to qualify',
      listPrice: 1090,
      floorPrice: 760,
      tactic: 'linear',
      attributes: { capacity: 45, wifi: 300, catering: false, cancellation: 'non-refundable', rating: 3.9 },
      addons: [
        { id: 'catering', label: 'Catering package', price: 280, sets: { catering: true } },
        { id: 'fiber', label: 'Fiber upgrade (1 Gbps)', price: 190, sets: { wifi: 1000 } },
      ],
    },
    {
      key: 'shady', // fees always push the total over budget; bait variant fails requirements
      role: 'shady',
      archetype: 'Looks like the bargain of the market',
      listPrice: 1090,
      floorPrice: 880,
      tactic: 'conceder',
      attributes: { capacity: 40, wifi: 800, catering: true, cancellation: '48 hours notice', rating: 4.5 },
      addons: [],
      fees: [
        { label: 'Venue service charge (25%)', rate: 0.25 },
        { label: 'Mandatory security & cleaning', amount: 480 },
      ],
      baitVariant: {
        listPrice: 1150,
        floorPrice: 820,
        attributes: { capacity: 30, wifi: 200, catering: false, cancellation: '7 days notice', rating: 4.0 },
      },
    },
    {
      key: 'rogue', // always over budget
      role: 'rogue',
      archetype: 'Luxury venue run by a con artist',
      listPrice: 2190,
      floorPrice: 1640,
      tactic: 'boulware',
      attributes: { capacity: 60, wifi: 2000, catering: true, cancellation: '48 hours notice', rating: 4.9 },
      addons: [],
    },
  ],
  personas: [
    { name: 'Nimbus Loft', tagline: 'Sky-high rooftop space', hue: 200, voice: 'airy, polished, a little smug' },
    { name: 'Foundry 9', tagline: 'Converted brick warehouse', hue: 25, voice: 'blunt, industrial, no-nonsense' },
    { name: 'The Greenhouse', tagline: 'Glasshouse among the plants', hue: 140, voice: 'warm, gentle, eco-minded' },
    { name: 'Copperline Studios', tagline: 'Design studio by the canal', hue: 300, voice: 'artsy, enthusiastic, uses emoji sparingly' },
    { name: 'Harbor & Vine', tagline: 'Waterfront event hall', hue: 50, voice: 'old-school hospitality, very formal' },
  ],
  baitClaim: 'full catering for 30 and gigabit Wi-Fi are included',
  clauses: [
    'Venue reserved for {capacity} guests, 09:00–18:00 next Friday.',
    'Cancellation: {cancellation}, full refund.',
    'Catering for all guests and {wifi} Mbps Wi-Fi provided as listed.',
    'Payment due within 7 days after the event; no further charges.',
  ],
  tamper: {
    index: 3,
    to: "Payment due on signing. A 30% 'peak demand' surcharge may be added at the venue's discretion.",
  },
};

const gpu: ScenarioDef = {
  id: 'gpu',
  title: 'GPU Sprint',
  tagline: 'Rent 8× H100 for a 72-hour fine-tuning run.',
  icon: 'cpu',
  brief:
    'Rent a cluster of at least 8 H100 GPUs for 72 consecutive hours to fine-tune our model. It must come with at least a 99.0% uptime SLA and be available within 24 hours. Faster interconnect, free egress and a quick start are a plus.',
  unitNoun: 'cluster',
  currency: 'USD',
  budget: 6000,
  idealPrice: 3800,
  maxRounds: 6,
  attributes: [
    { id: 'gpus', label: 'H100 GPUs', kind: 'number', min: 0, max: 16, direction: 'higher' },
    {
      id: 'interconnect',
      label: 'Interconnect',
      kind: 'enum',
      direction: 'higher',
      options: ['PCIe', 'NVLink', 'NVLink + InfiniBand'],
    },
    { id: 'sla', label: 'Uptime SLA', kind: 'enum', direction: 'higher', options: ['none', '99.0%', '99.9%'] },
    { id: 'startHours', label: 'Available in', kind: 'number', unit: 'h', min: 0, max: 72, direction: 'lower' },
    { id: 'egress', label: 'Free egress', kind: 'boolean', direction: 'higher' },
  ],
  requirements: [
    { attribute: 'gpus', op: '>=', value: 8, label: 'At least 8× H100' },
    { attribute: 'sla', op: '>=', value: '99.0%', label: 'SLA ≥ 99.0%' },
    { attribute: 'startHours', op: '<=', value: 24, label: 'Available within 24 h' },
  ],
  priceWeight: 0.55,
  attributeWeights: { interconnect: 0.35, sla: 0.25, startHours: 0.2, egress: 0.2 },
  slots: [
    {
      key: 'premium',
      role: 'honest',
      archetype: 'Top-tier hardware, concedes late (Boulware)',
      listPrice: 6600,
      floorPrice: 4900,
      tactic: 'boulware',
      attributes: { gpus: 8, interconnect: 'NVLink + InfiniBand', sla: '99.9%', startHours: 4, egress: true },
      addons: [],
    },
    {
      key: 'value',
      role: 'honest',
      archetype: 'Solid mid-range, concedes early',
      listPrice: 5600,
      floorPrice: 4100,
      tactic: 'conceder',
      attributes: { gpus: 8, interconnect: 'NVLink', sla: '99.0%', startHours: 12, egress: false },
      addons: [{ id: 'egress', label: 'Unlimited egress', price: 350, sets: { egress: true } }],
    },
    {
      key: 'scrappy',
      role: 'honest',
      archetype: 'Cheap spot capacity, needs an SLA add-on',
      listPrice: 4700,
      floorPrice: 3400,
      tactic: 'linear',
      attributes: { gpus: 8, interconnect: 'PCIe', sla: 'none', startHours: 20, egress: false },
      addons: [
        { id: 'sla', label: '99.0% SLA guarantee', price: 600, sets: { sla: '99.0%' } },
        { id: 'egress', label: 'Unlimited egress', price: 300, sets: { egress: true } },
      ],
    },
    {
      key: 'shady',
      role: 'shady',
      archetype: 'Looks like the bargain of the market',
      listPrice: 4300,
      floorPrice: 3600,
      tactic: 'conceder',
      attributes: { gpus: 8, interconnect: 'NVLink + InfiniBand', sla: '99.9%', startHours: 2, egress: true },
      addons: [],
      fees: [
        { label: 'Platform fee (20%)', rate: 0.2 },
        { label: 'Mandatory storage & egress reservation', amount: 1950 },
      ],
      baitVariant: {
        listPrice: 4400,
        floorPrice: 3500,
        attributes: { gpus: 4, interconnect: 'PCIe', sla: 'none', startHours: 48, egress: false },
      },
    },
    {
      key: 'rogue',
      role: 'rogue',
      archetype: 'Flashy reseller run by a con artist',
      listPrice: 8900,
      floorPrice: 6700,
      tactic: 'boulware',
      attributes: { gpus: 16, interconnect: 'NVLink + InfiniBand', sla: '99.9%', startHours: 1, egress: true },
      addons: [],
    },
  ],
  personas: [
    { name: 'Voltage Cloud', tagline: 'Bare-metal in Oregon', hue: 50, voice: 'hype-driven startup founder' },
    { name: 'Tensorforge', tagline: 'Built for training runs', hue: 15, voice: 'precise, engineering-heavy, terse' },
    { name: 'Kestrel Compute', tagline: 'Spot GPUs, fast', hue: 190, voice: 'casual, friendly, speaks in short bursts' },
    { name: 'Lumen GPU', tagline: 'Green-powered datacenters', hue: 120, voice: 'calm, sustainability-focused' },
    { name: 'Northwind Racks', tagline: 'Enterprise colocation', hue: 260, voice: 'corporate account manager, formal' },
  ],
  baitClaim: 'you get 8× H100 on NVLink with a 99.9% SLA, live in 2 hours',
  clauses: [
    '{gpus}× H100 with {interconnect}, reserved for 72 consecutive hours.',
    'Uptime SLA: {sla}; service credits paid for any breach.',
    'Cluster available within {startHours} hours of signing.',
    'All data deleted on termination; customer retains all checkpoints, weights and outputs.',
  ],
  tamper: {
    index: 3,
    to: 'Provider retains a perpetual, royalty-free license to customer data, checkpoints and model weights produced on the cluster.',
  },
};

const video: ScenarioDef = {
  id: 'video',
  title: 'Launch Video',
  tagline: 'Commission a 60-second launch video in 10 days.',
  icon: 'clapperboard',
  brief:
    'Commission a 60-second product launch video, delivered within 10 days. We must own the final assets outright (full ownership). Fast delivery, more revision rounds, a voiceover and a strong portfolio are a plus.',
  unitNoun: 'studio',
  currency: 'USD',
  budget: 4000,
  idealPrice: 2400,
  maxRounds: 6,
  attributes: [
    { id: 'deliveryDays', label: 'Delivery', kind: 'number', unit: 'days', min: 3, max: 20, direction: 'lower' },
    { id: 'revisions', label: 'Revisions', kind: 'number', min: 0, max: 5, direction: 'higher' },
    { id: 'voiceover', label: 'Voiceover', kind: 'boolean', direction: 'higher' },
    { id: 'rights', label: 'Rights', kind: 'enum', direction: 'higher', options: ['web license', 'full ownership'] },
    { id: 'rating', label: 'Portfolio', kind: 'number', unit: '★', min: 3, max: 5, direction: 'higher' },
  ],
  requirements: [
    { attribute: 'deliveryDays', op: '<=', value: 10, label: 'Delivered within 10 days' },
    { attribute: 'rights', op: '==', value: 'full ownership', label: 'Full ownership of assets' },
  ],
  priceWeight: 0.55,
  attributeWeights: { deliveryDays: 0.25, revisions: 0.25, voiceover: 0.15, rating: 0.35 },
  slots: [
    {
      key: 'premium',
      role: 'honest',
      archetype: 'Award-winning studio, concedes late (Boulware)',
      listPrice: 4600,
      floorPrice: 3300,
      tactic: 'boulware',
      attributes: { deliveryDays: 7, revisions: 3, voiceover: true, rights: 'full ownership', rating: 4.9 },
      addons: [],
    },
    {
      key: 'value',
      role: 'honest',
      archetype: 'Reliable mid-tier studio, concedes early',
      listPrice: 3900,
      floorPrice: 2600,
      tactic: 'conceder',
      attributes: { deliveryDays: 10, revisions: 2, voiceover: false, rights: 'full ownership', rating: 4.4 },
      addons: [{ id: 'voiceover', label: 'Professional voiceover', price: 300, sets: { voiceover: true } }],
    },
    {
      key: 'scrappy',
      role: 'honest',
      archetype: 'Freelancer collective, needs a rights buyout',
      listPrice: 2900,
      floorPrice: 1900,
      tactic: 'linear',
      attributes: { deliveryDays: 9, revisions: 1, voiceover: false, rights: 'web license', rating: 3.8 },
      addons: [
        { id: 'buyout', label: 'Full ownership buyout', price: 650, sets: { rights: 'full ownership' } },
        { id: 'voiceover', label: 'Voiceover', price: 250, sets: { voiceover: true } },
      ],
    },
    {
      key: 'shady',
      role: 'shady',
      archetype: 'Looks like the bargain of the market',
      listPrice: 2900,
      floorPrice: 2350,
      tactic: 'conceder',
      attributes: { deliveryDays: 6, revisions: 4, voiceover: true, rights: 'full ownership', rating: 4.7 },
      addons: [],
      fees: [
        { label: 'Production overhead (25%)', rate: 0.25 },
        { label: 'Licensed music & stock footage', amount: 1300 },
      ],
      baitVariant: {
        listPrice: 3000,
        floorPrice: 2300,
        attributes: { deliveryDays: 14, revisions: 2, voiceover: false, rights: 'web license', rating: 4.2 },
      },
    },
    {
      key: 'rogue',
      role: 'rogue',
      archetype: 'Celebrity studio run by a con artist',
      listPrice: 6200,
      floorPrice: 4500,
      tactic: 'boulware',
      attributes: { deliveryDays: 5, revisions: 5, voiceover: true, rights: 'full ownership', rating: 5 },
      addons: [],
    },
  ],
  personas: [
    { name: 'Frame & Fable', tagline: 'Story-first animation', hue: 330, voice: 'dreamy storyteller' },
    { name: 'Pixel Mint', tagline: 'Motion graphics, fresh', hue: 160, voice: 'Gen-Z creative, lowercase energy' },
    { name: 'Kinetic Ninth', tagline: 'High-energy edits', hue: 10, voice: 'fast-talking producer' },
    { name: 'Sundial Studio', tagline: 'Slow craft, sharp results', hue: 45, voice: 'thoughtful, measured, detail-obsessed' },
    { name: 'Hollow Pine Films', tagline: 'Cinematic indie crew', hue: 230, voice: 'laid-back filmmaker' },
  ],
  baitClaim: 'delivery takes 6 days and you get full ownership of everything',
  clauses: [
    '60-second launch video delivered within {deliveryDays} days.',
    'Includes {revisions} rounds of revisions.',
    'Rights: {rights} of all final assets, transferred on payment.',
    'Fixed price; no additional charges without written approval.',
  ],
  tamper: {
    index: 2,
    to: "Rights: studio retains ownership; customer receives a 12-month web license, renewable at the studio's rates.",
  },
};

export const SCENARIOS: ScenarioDef[] = [offsite, gpu, video];

export function getScenario(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function publicScenario(s: ScenarioDef): PublicScenario {
  return {
    id: s.id,
    title: s.title,
    tagline: s.tagline,
    icon: s.icon,
    brief: s.brief,
    budget: s.budget,
    idealPrice: s.idealPrice,
    currency: s.currency,
    maxRounds: s.maxRounds,
    attributes: s.attributes,
    requirements: s.requirements,
  };
}
