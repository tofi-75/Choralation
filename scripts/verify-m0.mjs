/**
 * Read-only verifier for the M0 design package.
 *
 * Resolves files relative to this script's project root, follows no symlinks,
 * and never installs packages or creates artifacts. Checks documentation links,
 * requirement coverage, fixture integrity, and the stated planning examples.
 * Its score calculation is an acceptance oracle, not application business code
 * and not evidence that an API, UI, or database implementation passes tests.
 *
 * Usage from the project root: node ./scripts/verify-m0.mjs
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set([
  '.git', '.venv', 'node_modules', '.cache', '.local', 'dist', 'build',
  'coverage', 'test-results', 'playwright-report', '__pycache__', '.pytest_cache',
]);
const failures = [];
const results = [];

/** Reject references escaping the project before any referenced file is read. */
function insideProject(candidate) {
  const relative = path.relative(projectRoot, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`)
    && relative !== '..' && !path.isAbsolute(relative));
}

/** Inventory project Markdown only; skip symlinks and dependency/cache trees. */
async function markdownFiles(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      found.push(...await markdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      found.push(entryPath);
    }
  }
  return found;
}

/** Execute independent checks and retain all failures for one useful report. */
async function check(label, work) {
  try {
    const detail = await work();
    results.push(`${label}: ${detail}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}

/** Load project-owned JSON. Fixture formats are validated by the checks below. */
async function json(relativePath) {
  const absolutePath = path.resolve(projectRoot, relativePath);
  assert(insideProject(absolutePath), 'JSON path escapes the project');
  return JSON.parse(await readFile(absolutePath, 'utf8'));
}

/** Compare logical membership without inventing an Arabic/browser collation. */
function sameMembers(actual, expected, label) {
  assert.deepEqual([...actual].sort(), [...expected].sort(), label);
}

/** Validate ISO dates explicitly; Date.parse alone can normalize invalid days. */
function calendarDate(value) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `Invalid ISO date: ${value}`);
  const instant = new Date(`${value}T00:00:00Z`);
  assert.equal(instant.toISOString().slice(0, 10), value, `Invalid calendar day: ${value}`);
  return instant;
}

/** Build an index and reject duplicated symbolic identities. */
function indexByKey(records, label) {
  const indexed = new Map();
  for (const record of records) {
    assert.equal(typeof record.key, 'string', `${label}: missing key`);
    assert(!indexed.has(record.key), `${label}: duplicate key ${record.key}`);
    indexed.set(record.key, record);
  }
  return indexed;
}

/** Derive occurrences from state and dates, never from stored usage counters. */
function usageFor(fixture, hymnKey, beforeDate = null) {
  const dates = [];
  for (const mass of fixture.masses) {
    if (mass.status !== 'finalized' || (beforeDate && mass.date >= beforeDate)) continue;
    for (const row of mass.selections) {
      if (row.hymn === hymnKey) dates.push(mass.date);
    }
  }
  return { usage_count: dates.length, last_used_date: dates.sort().at(-1) ?? null };
}

/** Planning-only boundary oracle; there is no zero-day ranking history. */
function recencyWeight(days) {
  assert(Number.isInteger(days) && days >= 1, 'Recency must be a positive whole day');
  if (days <= 7) return -60;
  if (days <= 14) return -30;
  if (days <= 30) return -10;
  if (days <= 60) return 5;
  if (days <= 90) return 10;
  return 15;
}

/** Recompute the proposal's score examples to catch contradictory fixtures. */
function plannedScore(fixture, hymn, target, placement) {
  if (!hymn.is_active || !hymn.placements.includes(placement)) return null;
  const seasonMatch = target.season !== null && hymn.seasons.includes(target.season);
  if (target.season !== null && !seasonMatch && !hymn.is_season_neutral) return null;
  let score = 50 + (seasonMatch ? 30 : 0) + (hymn.is_season_neutral ? 15 : 0);
  const usage = usageFor(fixture, hymn.key, target.date);
  if (usage.last_used_date === null) {
    score += 20;
  } else {
    // Date-only UTC arithmetic avoids DST shifting a calendar-day difference.
    const days = (calendarDate(target.date) - calendarDate(usage.last_used_date)) / 86_400_000;
    score += recencyWeight(days);
  }
  if (target.selections.some(row => row.hymn === hymn.key)) score -= 100;
  return score;
}

await check('Local documentation links', async () => {
  let linksChecked = 0;
  const files = await markdownFiles(projectRoot);
  for (const file of files) {
    // Illustrative code blocks can contain Markdown-shaped text, not real links.
    const prose = (await readFile(file, 'utf8')).replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
    for (const match of prose.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
      const href = match[1].trim().replace(/^<|>$/g, '');
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) continue;
      const pathname = decodeURIComponent(href.split('#')[0]);
      if (!pathname) continue;
      const target = path.resolve(path.dirname(file), pathname);
      assert(insideProject(target), `${path.relative(projectRoot, file)}: link escapes project: ${href}`);
      assert((await stat(target)).isFile(), `Not a file: ${href}`);
      linksChecked += 1;
    }
  }
  return `${linksChecked} local links in ${files.length} Markdown files`;
});

await check('Source requirement coverage', async () => {
  const mapping = await json('docs/requirements.json');
  const source = await readFile(path.join(projectRoot, mapping.source), 'utf8');
  const sourceSections = new Set([...source.matchAll(/^#{1,2}\s+(\d+)\.\s/gm)].map(match => Number(match[1])));
  assert.equal(sourceSections.size, 79, 'Expected 79 top-level source sections');
  const covered = new Set();
  for (let milestone = 0; milestone <= 7; milestone += 1) {
    const sections = mapping.milestones[`M${milestone}`];
    assert(sections?.length, `Missing M${milestone} ownership mapping`);
    for (const section of sections) {
      assert(sourceSections.has(section), `Unknown source section ${section}`);
      covered.add(section);
    }
  }
  sameMembers(covered, sourceSections, 'Unmapped source requirement');
  return '79/79 sections mapped across M0–M7 (ownership, not implementation completion)';
});

await check('Dependency baseline', async () => {
  const baseline = await json('docs/dependency-baseline.json');
  assert.equal(baseline.status, 'selected_not_installed');
  for (const [name, version] of Object.entries({ ...baseline.python, ...baseline.node })) {
    assert.match(version, /^\d+\.\d+(?:\.\d+)?$/, `${name}: pin must be exact stable version`);
  }
  assert.equal(baseline.node.react, baseline.node['react-dom']);
  assert.equal(baseline.node.tailwindcss, baseline.node['@tailwindcss/vite']);
  assert.match(baseline.node.typescript, /^6\.0\./, 'Selected TypeScript must respect inspected lint peer range');
  return `${Object.keys(baseline.python).length} Python and ${Object.keys(baseline.node).length} npm selections; historical M0 baseline, not an installation check`;
});

await check('Fixture relationships and ordering', async () => {
  const fixture = await json('docs/fixtures/m0-scenarios.json');
  assert.equal(fixture.schema_version, 1);
  calendarDate(fixture.reference_date);
  const categories = Object.fromEntries(Object.entries(fixture.categories).map(([kind, records]) => [kind, indexByKey(records, kind)]));
  const hymns = indexByKey(fixture.hymns, 'hymns');
  indexByKey(fixture.masses, 'masses');
  const selectionKeys = new Set();
  for (const hymn of fixture.hymns) {
    assert(hymn.title.trim(), `${hymn.key}: blank title`);
    assert(categories.languages.has(hymn.language), `${hymn.key}: unknown language`);
    assert(hymn.placements.length > 0, `${hymn.key}: no placements`);
    assert(hymn.is_season_neutral || hymn.seasons.length > 0, `${hymn.key}: no season`);
    for (const kind of ['genres', 'seasons', 'placements', 'tags']) {
      assert.equal(new Set(hymn[kind]).size, hymn[kind].length, `${hymn.key}: repeated category ID`);
      for (const key of hymn[kind]) assert(categories[kind].has(key), `${hymn.key}: unknown ${kind}/${key}`);
    }
  }
  for (const mass of fixture.masses) {
    calendarDate(mass.date);
    assert(['draft', 'finalized'].includes(mass.status), `${mass.key}: invalid status`);
    assert(mass.season === null || categories.seasons.has(mass.season), `${mass.key}: unknown season`);
    const positions = new Map();
    for (const row of mass.selections) {
      assert(!selectionKeys.has(row.key), `Duplicate selection identity ${row.key}`);
      selectionKeys.add(row.key);
      assert(hymns.has(row.hymn), `${row.key}: unknown hymn`);
      assert(categories.placements.has(row.placement), `${row.key}: unknown placement`);
      assert(Number.isInteger(row.position) && row.position >= 0, `${row.key}: invalid position`);
      const group = positions.get(row.placement) ?? [];
      group.push(row.position);
      positions.set(row.placement, group);
    }
    for (const [placement, group] of positions) {
      assert.deepEqual(group.sort((a, b) => a - b), group.map((_, index) => index), `${mass.key}/${placement}: noncontiguous or duplicate position`);
    }
  }
  return `${hymns.size} hymns, ${fixture.masses.length} Masses, ${selectionKeys.size} stable selection identities`;
});

await check('History and ranking planning examples', async () => {
  const fixture = await json('docs/fixtures/m0-scenarios.json');
  for (const [hymnKey, expected] of Object.entries(fixture.expected.global_usage)) {
    assert.deepEqual(usageFor(fixture, hymnKey), expected, `${hymnKey}: incorrect global usage`);
  }
  const target = fixture.masses.find(mass => mass.key === 'M_TARGET');
  assert(target && target.date === fixture.reference_date, 'Missing consistent target Mass');
  const scores = {};
  const ineligible = [];
  for (const hymn of fixture.hymns) {
    const score = plannedScore(fixture, hymn, target, 'communion');
    if (score === null) ineligible.push(hymn.key);
    else scores[hymn.key] = score;
  }
  assert.deepEqual(scores, fixture.expected.target_communion_scores, 'Score expectation mismatch');
  sameMembers(ineligible, fixture.expected.ineligible_target_communion, 'Eligibility mismatch');
  for (const boundary of fixture.expected.recency_weights) assert.equal(recencyWeight(boundary.days), boundary.weight);
  return '4 global usage examples, 5 scores, 3 exclusions, and 11 recency boundaries consistent';
});

await check('Literal filtering planning examples', async () => {
  const fixture = await json('docs/fixtures/m0-scenarios.json');
  const active = fixture.hymns.filter(hymn => hymn.is_active);
  const keys = records => records.map(record => record.key);
  const expected = fixture.expected;
  sameMembers(keys(active.filter(hymn => hymn.seasons.includes('easter') && hymn.placements.includes('communion') && hymn.genres.includes('traditional') && hymn.language === 'arabic')), expected.literal_easter_communion_traditional_arabic, 'Combined literal filters');
  sameMembers(keys(active.filter(hymn => hymn.placements.includes('communion') && ['arabic', 'french'].includes(hymn.language))), expected.literal_communion_arabic_or_french, 'OR within languages');
  const tags = indexByKey(fixture.categories.tags, 'tags');
  const searchable = hymn => [hymn.title, hymn.alternate_title, hymn.first_line, hymn.composer, hymn.source_or_hymnal, ...hymn.tags.map(tag => tags.get(tag).name)].filter(Boolean).join(' ').toLowerCase();
  sameMembers(keys(active.filter(hymn => searchable(hymn).includes('mary') && hymn.placements.includes('closing'))), expected.search_mary_and_closing, 'Search with placement');
  sameMembers(keys(active.filter(hymn => {
    const usage = usageFor(fixture, hymn.key);
    return usage.last_used_date === null || usage.last_used_date < '2026-04-01';
  })), expected.not_used_since_april_1, 'Never-used/old-use inclusion');
  return '4 combined-filter result sets consistent';
});

const sourceBytes = await readFile(path.join(projectRoot, 'mass_hymn_picker_codex_spec.md'));
const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');
for (const result of results) console.log(`PASS ${result}`);
for (const failure of failures) console.error(`FAIL ${failure}`);
console.log(`Source SHA-256: ${sourceHash}`);
if (failures.length > 0) {
  process.exitCode = 1;
} else {
  console.log('M0 static verification passed. This verifier does not assess application execution or human usability; see milestone reports for implementation evidence.');
}
