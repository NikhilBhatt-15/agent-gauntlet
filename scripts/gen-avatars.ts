/**
 * Generates the shopkeeper portraits (one SVG per character per mood) into web/public/avatars/.
 *   npx tsx scripts/gen-avatars.ts
 * Art: "Avataaars" by Pablo Stanley (free for personal and commercial use), rendered with DiceBear (MIT).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createAvatar } from '@dicebear/core';
import { avataaars, bottts } from '@dicebear/collection';
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
  pappu: {
    skinColor: ['ae5d29'],
    top: ['shortWaved'],
    hairColor: ['2c1b18'],
    facialHair: ['moustacheFancy'],
    facialHairColor: ['2c1b18'],
    facialHairProbability: 100,
    clothing: ['shirtCrewNeck'],
    clothesColor: ['c8a165'],
    accessoriesProbability: 0,
  },
  amma: {
    skinColor: ['ae5d29'],
    top: ['bigHair'],
    hairColor: ['b1b1b1'],
    facialHairProbability: 0,
    clothing: ['shirtScoopNeck'],
    clothesColor: ['15803d'],
    accessoriesProbability: 0,
  },
  rocky: {
    skinColor: ['d08b5b'],
    top: ['shaggyMullet'],
    hairColor: ['4a312c'],
    facialHair: ['beardLight'],
    facialHairColor: ['4a312c'],
    facialHairProbability: 100,
    clothing: ['graphicShirt'],
    clothingGraphic: ['pizza'],
    clothesColor: ['0891b2'],
    accessoriesProbability: 0,
  },
  sharma: {
    skinColor: ['edb98a'],
    top: ['shortRound'],
    hairColor: ['2c1b18'],
    facialHair: ['moustacheMagnum'],
    facialHairColor: ['4a312c'],
    facialHairProbability: 100,
    clothing: ['blazerAndSweater'],
    clothesColor: ['7f1d1d'],
    accessories: ['prescription02'],
    accessoriesColor: ['262e33'],
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
// SastaKart Assist is a literal bot: "Bottts" by Pablo Stanley (free for personal and commercial use).
const BOT_FACES: Record<Mood, Opts> = {
  happy: { eyes: ['happy'], mouth: ['smile01'] },
  neutral: { eyes: ['round'], mouth: ['square01'] },
  annoyed: { eyes: ['frame2'], mouth: ['grill01'] },
  angry: { eyes: ['robocop'], mouth: ['grill03'] },
  impressed: { eyes: ['hearts'], mouth: ['smile02'] },
  suspicious: { eyes: ['sensor'], mouth: ['diagram'] },
};
for (const [mood, face] of Object.entries(BOT_FACES)) {
  const svg = createAvatar(bottts, { seed: 'sastakart', baseColor: ['5c6bc0'], mouthProbability: 100, ...face } as never).toString();
  fs.writeFileSync(path.join(out, `bot-${mood}.svg`), svg);
  n++;
}
console.log(`wrote ${n} portraits to ${out}`);
