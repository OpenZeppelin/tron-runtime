#!/usr/bin/env node
// API-surface + release gate for @openzeppelin/tron-runtime.
//
// (1) The BUILT package's runtime exports must match api-inventory.json exactly,
//     loaded through the export map (require -> dist/index.js) — so accidental
//     additions/removals to the public surface fail CI.
// (2) A non-prerelease (stable) version cannot ship while any export is still
//     `provisional` — the mechanical form of the 4.5.0 release gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Inventory {
  functions: { name: string; tier: 'stable' | 'provisional' }[];
  types: { name: string; tier: 'stable' | 'provisional' }[];
}

const root = join(__dirname, '..');
const inventory = JSON.parse(readFileSync(join(root, 'api-inventory.json'), 'utf8')) as Inventory;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

// Loaded via the export map (require -> dist/index.js); `npm run check:api` builds first.
const runtime = require('@openzeppelin/tron-runtime') as Record<string, unknown>;
// ALL runtime value exports — not just functions — so a stray public const/class is caught too.
const actual = Object.keys(runtime).sort();
const declared = inventory.functions.map((f) => f.name).sort();

assert.deepEqual(
  actual,
  declared,
  `runtime value exports differ from api-inventory.json\n  actual:   ${actual.join(', ')}\n  declared: ${declared.join(', ')}`,
);

// Type surface: the generated barrel .d.ts must export exactly the declared type names
// (catches an ADDED untracked type; types are erased at runtime so `actual` can't see them).
const dts = readFileSync(join(root, 'dist', 'index.d.ts'), 'utf8');
const exportedTypes = [...dts.matchAll(/export\s+type\s*\{([^}]*)\}/g)]
  .flatMap((m) => m[1]!.split(','))
  .map((s) => s.trim().replace(/^\w+\s+as\s+/, '').trim())
  .filter(Boolean)
  .sort();
const declaredTypes = inventory.types.map((t) => t.name).sort();
assert.deepEqual(
  exportedTypes,
  declaredTypes,
  `exported types in dist/index.d.ts differ from api-inventory.json\n  actual:   ${exportedTypes.join(', ')}\n  declared: ${declaredTypes.join(', ')}`,
);

// SemVer prerelease is the segment after `-`, ignoring `+build` metadata — so
// `1.0.0+build-1` (a hyphen only in build metadata) is a STABLE release, not a prerelease.
const isPrerelease = pkg.version.split('+')[0]!.includes('-');
const provisional = [
  ...inventory.functions.filter((f) => f.tier === 'provisional').map((f) => f.name),
  ...inventory.types.filter((t) => t.tier === 'provisional').map((t) => `${t.name} (type)`),
];
if (!isPrerelease && provisional.length > 0) {
  throw new Error(
    `release gate: version ${pkg.version} is stable but ${provisional.length} export(s) are still provisional: ` +
      `${provisional.join(', ')}. Prove / redesign / remove them from the root first (4.5.0).`,
  );
}

console.log(
  `✓ API surface matches inventory (${actual.length} functions, ${inventory.types.length} types); ` +
    `version ${pkg.version}${isPrerelease ? ' — prerelease, provisional exports allowed' : ' — stable, no provisional exports'}`,
);
