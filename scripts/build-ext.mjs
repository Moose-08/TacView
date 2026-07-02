import { cpSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'public');
const dest = path.join(root, 'extension', 'app');

if (existsSync(dest)) rmSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Extension app synced: ${src} → ${dest}`);
console.log('Load the extension/ folder as an unpacked extension in Chrome/Edge.');
