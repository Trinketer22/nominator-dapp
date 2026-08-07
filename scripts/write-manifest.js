import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (!process.env.VITE_DEPLOY_ORIGIN) {
  throw new Error('Specify origin for tc manifest via env VITE_DEPLOY_ORIGIN!');
}
const origin = process.env.VITE_DEPLOY_ORIGIN.replace(/\/+$/, '');

const manifest = {
  url: `${origin}/`,
  name: 'Nominator Pool',
  iconUrl: `${origin}/app-icon.svg`,
};

const outPath = resolve(projectRoot, 'dist', 'tonconnect-manifest.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`wrote ${outPath} (origin: ${origin})`);
