#!/usr/bin/env node
// Assert the packed tarball ships exactly the runtime artifacts — no source,
// tests, tsconfig, scripts, or stray files. Run after `npm run build`.
import { execFileSync } from 'node:child_process';

interface PackedFile {
  path: string;
}
interface PackResult {
  files: PackedFile[];
}

const EXPECTED = [
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'package.json',
  'dist/address.d.ts',
  'dist/address.js',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/json.d.ts',
  'dist/json.js',
  'dist/receipt.d.ts',
  'dist/receipt.js',
  'dist/tx.d.ts',
  'dist/tx.js',
].sort();

const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' });
const parsed = JSON.parse(raw) as PackResult[];
const files = parsed[0]!.files.map((f) => f.path).sort();

const forbidden = files.filter(
  (f) =>
    f.startsWith('src/') ||
    f.startsWith('test/') ||
    f.startsWith('scripts/') ||
    f.startsWith('.github/') ||
    f.startsWith('tsconfig') ||
    (f.endsWith('.ts') && !f.endsWith('.d.ts')),
);
if (forbidden.length > 0) {
  console.error('❌ Forbidden files in package tarball:', forbidden);
  process.exit(1);
}
if (JSON.stringify(files) !== JSON.stringify(EXPECTED)) {
  console.error('❌ Package contents mismatch.\n  got:', files, '\n  expected:', EXPECTED);
  process.exit(1);
}
console.log(`✓ package contents OK (${files.length} files)`);
