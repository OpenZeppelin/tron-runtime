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
  types: string[];
}

const root = join(__dirname, '..');
const inventory = JSON.parse(readFileSync(join(root, 'api-inventory.json'), 'utf8')) as Inventory;
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

// Loaded via the export map (require -> dist/index.js); `npm run check:api` builds first.
const runtime = require('@openzeppelin/tron-runtime') as Record<string, unknown>;
const actual = Object.keys(runtime)
  .filter((k) => typeof runtime[k] === 'function')
  .sort();
const declared = inventory.functions.map((f) => f.name).sort();

assert.deepEqual(
  actual,
  declared,
  `runtime function exports differ from api-inventory.json\n  actual:   ${actual.join(', ')}\n  declared: ${declared.join(', ')}`,
);

const isPrerelease = pkg.version.includes('-');
const provisional = inventory.functions.filter((f) => f.tier === 'provisional').map((f) => f.name);
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
