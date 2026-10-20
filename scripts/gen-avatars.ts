/**
 * Generates the shopkeeper portraits (one SVG per character per mood) into web/public/avatars/.
 *   npx tsx scripts/gen-avatars.ts
 * Art: "Avataaars" by Pablo Stanley (free for personal and commercial use), rendered with DiceBear (MIT).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAvatar } from '@dicebear/core';
import { avataaars } from '@dicebear/collection';
import type { Mood } from '../shared/types.ts';

// avataaars options (skinColor, top, eyes, mouth, ...); kept loose so the tables stay readable
type Opts = Record<string, unknown>;

/** Who each character is, visually. Colours are hex without '#'. */
const LOOKS: Record<string, Opts> = {
  raju: {
    skinColor: ['ae5d29'],
    top: ['shortFlat'],
    hairColor: ['2c1b18'],
    facialHair: ['moustacheMagnum'],
    facialHairColor: ['2c1b18'],
    facialHairProbability: 100,
    clothing: ['shirtVNeck'],
    clothesColor: ['ff8c42'],
    accessoriesProbability: 0,
  },
  pinky: {
    skinColor: ['d08b5b'],
    top: ['bigHair'],
    hairColor: ['2c1b18'],
    facialHairProbability: 0,
    clothing: ['shirtScoopNeck'],
    clothesColor: ['e2186f'],
    accessories: ['round'],
    accessoriesColor: ['b8860b'],
    accessoriesProbability: 100,
  },
  bunty: {
    skinColor: ['d08b5b'],
    top: ['theCaesarAndSidePart'],
    hairColor: ['2c1b18'],
    facialHair: ['beardLight'],
    facialHairColor: ['2c1b18'],
    facialHairProbability: 100,
    clothing: ['graphicShirt'],
    clothingGraphic: ['bolt'],
    clothesColor: ['2563eb'],
    accessoriesProbability: 0,
  },
  paaji: {
    skinColor: ['ae5d29'],
    top: ['turban'],
    hatColor: ['f97316'],
    facialHair: ['beardMajestic'],
    facialHairColor: ['2c1b18'],
    facialHairProbability: 100,
    clothing: ['collarAndSweater'],
    clothesColor: ['15803d'],
    accessoriesProbability: 0,
  },
  seth: {
    skinColor: ['edb98a'],
    top: ['sides'],
    hairColor: ['c0c0c0'],
    facialHair: ['moustacheFancy'],
    facialHairColor: ['9e9e9e'],
    facialHairProbability: 100,
    clothing: ['blazerAndShirt'],
    clothesColor: ['262e33'],
    accessories: ['prescription01'],
    accessoriesColor: ['3c4f5c'],
    accessoriesProbability: 100,
  },
  munim: {
    skinColor: ['d08b5b'],
    top: ['sides'],
    hairColor: ['e8e1e1'],
    facialHair: ['moustacheFancy'],
    facialHairColor: ['e8e1e1'],
    facialHairProbability: 100,
    clothing: ['collarAndSweater'],
    clothesColor: ['a7a7a7'],
    accessories: ['round'],
    accessoriesColor: ['3c4f5c'],
    accessoriesProbability: 100,
  },
};

/** One face per mood. */
const FACES: Record<Mood, Opts> = {
  happy: { eyes: ['happy'], eyebrows: ['raisedExcitedNatural'], mouth: ['smile'] },
  neutral: { eyes: ['default'], eyebrows: ['defaultNatural'], mouth: ['default'] },
  annoyed: { eyes: ['eyeRoll'], eyebrows: ['flatNatural'], mouth: ['serious'] },
  angry: { eyes: ['squint'], eyebrows: ['angryNatural'], mouth: ['screamOpen'] },
  impressed: { eyes: ['surprised'], eyebrows: ['raisedExcited'], mouth: ['twinkle'] },
  suspicious: { eyes: ['side'], eyebrows: ['upDownNatural'], mouth: ['concerned'] },
};

const out = path.resolve('web/public/avatars');
fs.mkdirSync(out, { recursive: true });
let n = 0;
for (const [who, look] of Object.entries(LOOKS)) {
  for (const [mood, face] of Object.entries(FACES)) {
    if (who === 'munim' && mood !== 'neutral' && mood !== 'angry' && mood !== 'happy') continue;
    const svg = createAvatar(avataaars, { seed: who, style: ["default"], ...look, ...face } as never).toString();
    fs.writeFileSync(path.join(out, `${who}-${mood}.svg`), svg);
    n++;
  }
}
console.log(`wrote ${n} portraits to ${out}`);
