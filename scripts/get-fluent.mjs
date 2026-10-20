// Downloads the Fluent 3D emoji used by the UI into web/public/fluent/ (MIT, Microsoft fluentui-emoji).
//   node scripts/get-fluent.mjs
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets';
// local name -> repo folder (skin-tone emoji live under /Default/)
const WANT = {
  chai: 'Teacup without handle',
  cup: 'Hot beverage',
  kurti: 'Dress',
  phone: 'Mobile phone',
  car: 'Automobile',
  house: 'House with garden',
  happy: 'Grinning face with smiling eyes',
  neutral: 'Slightly smiling face',
  annoyed: 'Unamused face',
  angry: 'Pouting face',
  impressed: 'Star-struck',
  suspicious: 'Face with raised eyebrow',
  steam: 'Face with steam from nose',
  anger: 'Anger symbol',
  sparkles: 'Sparkles',
  collision: 'Collision',
  handshake: 'Handshake',
  walking: 'Person walking',
  receipt: 'Receipt',
  diya: 'Diya lamp',
  trophy: 'Trophy',
  lock: 'Locked',
  party: 'Party popper',
  money: 'Money with wings',
  bags: 'Shopping bags',
  bulb: 'Light bulb',
  target: 'Bullseye',
  shop: 'Convenience store',
  medal1: '1st place medal',
  medal2: '2nd place medal',
  medal3: '3rd place medal',
  auto: 'Auto rickshaw',
  veggies: 'Leafy green',
  scooter: 'Motor scooter',
  food: 'Pot of food',
  laptop: 'Laptop',
  dice: 'Game die',
  robot: 'Robot',
};
const out = path.resolve('web/public/fluent');
fs.mkdirSync(out, { recursive: true });
for (const [name, folder] of Object.entries(WANT)) {
  // (images are then shrunk to 128px; see README)
  const file = folder === 'Star-struck' ? 'star-struck' : folder.toLowerCase().replace(/ /g, '_').replace(/-/g, '_').replace(/[^a-z0-9_]/g, '');
  const urls = [`${BASE}/${encodeURIComponent(folder)}/3D/${file}_3d.png`, `${BASE}/${encodeURIComponent(folder)}/Default/3D/${file}_3d_default.png`];
  let ok = false;
  for (const u of urls) {
    const r = await fetch(u);
    if (r.ok) {
      fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(await r.arrayBuffer()));
      ok = true;
      break;
    }
  }
  console.log(ok ? '✓' : '✗', name, folder);
}
