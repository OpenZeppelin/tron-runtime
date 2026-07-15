#!/usr/bin/env node
// API-surface + release gate for @openzeppelin/tron-runtime.
//
// (1) The BUILT package's runtime exports must match api-inventory.json exactly,
//     loaded through the export map (require -> dist/index.js) — so accidental
//     additions/removals to the public surface fail CI.
// (2) A non-prerelease (stable) version cannot ship while any export is still
//     `provisional` — the release gate that blocks a stable publish.
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

// Validate the inventory at runtime — the `as Inventory` cast is a compile-time
// fiction that trusts the JSON. Without this, a mistyped tier (e.g. "provisionl")
// would silently drop an entry from the provisional set below and let a stable
// release pass the gate. Every entry must have a non-empty name and a known tier.
const VALID_TIERS = new Set(['stable', 'provisional']);
for (const kind of ['functions', 'types'] as const) {
  assert(Array.isArray(inventory[kind]), `api-inventory.json: "${kind}" must be an array`);
  for (const entry of inventory[kind]) {
    assert(
      typeof entry?.name === 'string' && entry.name.length > 0,
      `api-inventory.json: an entry in "${kind}" is missing a non-empty "name"`,
    );
    assert(
      VALID_TIERS.has(entry.tier),
      `api-inventory.json: entry "${entry.name}" has an invalid tier ${JSON.stringify(entry.tier)} (expected "stable" or "provisional")`,
    );
  }
}

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
const typeNames = new Set<string>();
// Braced type re-exports: `export type { A, B as C }`.
for (const m of dts.matchAll(/export\s+type\s*\{([^}]*)\}/g)) {
  for (const part of m[1]!.split(',')) {
    const name = part.trim().replace(/^\w+\s+as\s+/, '').trim();
    if (name) typeNames.add(name);
  }
}
// Direct type declarations: `export interface X`, `export type X = ...`, `export enum X`
// (optionally `declare`). Without this, an added `export interface` would bypass the
// type-surface diff entirely — the braced-only scan never saw it.
for (const m of dts.matchAll(/export\s+(?:declare\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
  typeNames.add(m[1]!);
}
const exportedTypes = [...typeNames].sort();
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
      `${provisional.join(', ')}. Prove / redesign / remove them from the root first.`,
  );
}

console.log(
  `✓ API surface matches inventory (${actual.length} functions, ${inventory.types.length} types); ` +
    `version ${pkg.version}${isPrerelease ? ' — prerelease, provisional exports allowed' : ' — stable, no provisional exports'}`,
);
