import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const { rcedit } = createRequire(import.meta.url)('rcedit');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const buildDir = path.join(root, 'build');

function listFiles(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, rel));
    else out.push(rel);
  }
  return out;
}

if (existsSync(buildDir)) rmSync(buildDir, { recursive: true });
mkdirSync(buildDir);

const assets = { 'overlay-native.ps1': path.join(root, 'overlay-native.ps1') };
for (const rel of listFiles(path.join(root, 'public'))) {
  assets[`public/${rel}`] = path.join(root, 'public', rel);
}

const seaConfig = {
  main: path.join(root, 'server.js'),
  output: path.join(buildDir, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true,
  assets,
};
writeFileSync(path.join(buildDir, 'sea-config.json'), JSON.stringify(seaConfig, null, 2));

execSync(`node --experimental-sea-config "${path.join(buildDir, 'sea-config.json')}"`, { stdio: 'inherit' });

const exePath = path.join(buildDir, 'TACVIEW.exe');
cpSync(process.execPath, exePath);

await rcedit(exePath, {
  icon: path.join(root, 'assets', 'icon.ico'),
  'version-string': {
    ProductName: 'TACVIEW',
    FileDescription: 'TACVIEW tactical map for War Thunder',
    CompanyName: 'TACVIEW',
    LegalCopyright: '',
  },
  'product-version': '0.1.0',
  'file-version': '0.1.0',
});

execSync(
  `npx -y postject "${exePath}" NODE_SEA_BLOB "${path.join(buildDir, 'sea-prep.blob')}" ` +
  '--sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  { stdio: 'inherit' }
);

rmSync(path.join(buildDir, 'sea-prep.blob'));
rmSync(path.join(buildDir, 'sea-config.json'));
console.log(`\nDone: ${exePath}`);
