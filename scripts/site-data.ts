// Generates the four JSON artifacts the site reads (docs/WEBSITE.md §7.3).
//
//   stats.json      counts — authored vs executed, feature files, ADRs
//   scenarios.json  every scenario in features/, with tags and CI-inclusion
//   spine.json      the pipeline stage order, straight from core/signal-graph.ts
//   adr.json        the ADR index, parsed from each file's H1 + metadata bullets
//
// Nothing here is hand-typed, which is the whole point: a count on the site cannot drift
// from the repo. Deliberately absent: any unit-test count. It moves with every commit and
// tells a reader nothing — repo prose says "the node:test unit suite is green" instead.
//
// Run: npm run site:data

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator } from '@cucumber/messages';
import {
  PER_BUS_STAGES,
  COMBINE_STAGE,
  DOWNSTREAM_STAGES,
  STAGE_ORDER,
} from '../src/core/signal-graph.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'site', 'generated');

// ---------------------------------------------------------------- features

export interface ScenarioRecord {
  readonly feature: string;
  readonly featureName: string;
  readonly rule: string | null;
  readonly name: string;
  readonly keyword: string;
  readonly tags: readonly string[];
  readonly steps: readonly string[];
  /** Example rows for an Outline (1 for a plain Scenario). */
  readonly examples: number;
  /** True when test/cucumber.mjs's include-list selects this scenario. */
  readonly executed: boolean;
  readonly line: number;
}

function parseFeatures(): { records: ScenarioRecord[]; featureFiles: string[] } {
  const dir = join(ROOT, 'features');
  const files = readdirSync(dir).filter((f) => f.slice(-8) === '.feature').sort();
  const uuidFn = IdGenerator.uuid();
  const parser = new Parser(new AstBuilder(uuidFn), new GherkinClassicTokenMatcher());
  const records: ScenarioRecord[] = [];

  for (const file of files) {
    const source = readFileSync(join(dir, file), 'utf8');
    const doc = parser.parse(source);
    const feature = doc.feature;
    if (!feature) continue;

    const featureTags: string[] = feature.tags.map((t) => t.name);

    // Background steps run before every scenario in their scope, so cucumber counts them
    // once per scenario. Backgrounds nest: a Rule may add one on top of the Feature's.
    const visit = (children: readonly any[], ruleName: string | null, inherited: string[]): void => {
      let background: string[] = inherited;
      for (const child of children) {
        if (child.background) {
          const own: string[] = inherited.slice();
          for (const s of child.background.steps) own.push(`${s.keyword}${s.text}`);
          background = own;
        }
      }
      for (const child of children) {
        if (child.rule) {
          visit(child.rule.children, child.rule.name, background);
          continue;
        }
        const sc = child.scenario;
        if (!sc) continue;
        const tags: string[] = featureTags.slice();
        for (const t of sc.tags) tags.push(t.name);

        // A Scenario Outline contributes one scenario per example row.
        let examples = 1;
        if (sc.examples && sc.examples.length) {
          examples = 0;
          for (const ex of sc.examples) examples += ex.tableBody ? ex.tableBody.length : 0;
        }

        records.push({
          feature: file,
          featureName: feature.name,
          rule: ruleName,
          name: sc.name,
          keyword: sc.keyword,
          tags,
          steps: background.concat(sc.steps.map((s: any) => `${s.keyword}${s.text}`)),
          examples,
          executed: false,
          line: sc.location.line,
        });
      }
    };
    visit(feature.children, null, []);
  }

  return { records, featureFiles: files };
}

/** The CI include-list from test/cucumber.mjs (paths + scenario names). */
async function loadCucumberConfig(): Promise<{ paths: string[]; names: string[] }> {
  const mod = (await import(pathToFileURL(join(ROOT, 'test', 'cucumber.mjs')).href)) as {
    default: { paths?: string[]; name?: string[] };
  };
  return { paths: mod.default.paths ?? [], names: mod.default.name ?? [] };
}

// ---------------------------------------------------------------- ADRs

export interface AdrRecord {
  readonly id: string;
  readonly number: number;
  readonly file: string;
  readonly title: string;
  readonly status: string;
  readonly date: string;
  readonly deciders: string;
  /** Optional `- Stages:` bullet. Empty until ADRs carry one — see docs/WEBSITE.md §7.3. */
  readonly stages: readonly string[];
  readonly summary: string;
}

function parseAdrs(): AdrRecord[] {
  const dir = join(ROOT, 'adr');
  const files = readdirSync(dir)
    .filter((f) => f.slice(-3) === '.md' && f !== 'README.md')
    .sort();
  const out: AdrRecord[] = [];

  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    const lines = text.split('\n');

    let title = file;
    let id = '';
    let number = 0;
    const h1 = lines.find((l) => l.slice(0, 2) === '# ');
    if (h1) {
      const stripped = h1.slice(2).trim();
      const m = /^ADR-(\d+):\s*(.*)$/.exec(stripped);
      if (m) {
        id = `ADR-${m[1]}`;
        number = Number(m[1]);
        title = m[2] ?? stripped;
      } else {
        title = stripped;
      }
    }

    const bullet = (key: string): string => {
      for (const line of lines) {
        const m = new RegExp(`^-\\s*${key}:\\s*(.*)$`, 'i').exec(line.trim());
        if (m) return (m[1] ?? '').trim();
      }
      return '';
    };

    const stagesRaw = bullet('Stages');
    const stages = stagesRaw ? stagesRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];

    // First paragraph after the metadata block, as a one-line summary.
    let summary = '';
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!.trim();
      if (!l || l[0] === '#' || l[0] === '-' || l[0] === '>' || l[0] === '|') continue;
      summary = l;
      break;
    }

    out.push({
      id: id || file,
      number,
      file,
      title,
      status: bullet('Status') || 'Unknown',
      date: bullet('Date'),
      deciders: bullet('Deciders'),
      stages,
      summary,
    });
  }
  return out;
}

// ---------------------------------------------------------------- main

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  const { records, featureFiles } = parseFeatures();
  const config = await loadCucumberConfig();

  // Mark executed scenarios. cucumber-js treats each `name:` entry as a REGULAR EXPRESSION
  // matched against the scenario name (not an exact string), so one entry can select several
  // scenarios — matching that behaviour is what makes these counts agree with a dry run.
  const namePatterns = config.names.map((n) => new RegExp(n));
  const pathSet: Record<string, true> = {};
  for (const p of config.paths) pathSet[p.replace(/^features\//, '')] = true;

  const selectedByName = (name: string): boolean => {
    for (let i = 0; i < namePatterns.length; i++) if (namePatterns[i]!.test(name)) return true;
    return false;
  };

  const marked: ScenarioRecord[] = records.map((r) => ({
    ...r,
    executed: pathSet[r.feature] === true && selectedByName(r.name),
  }));

  let authoredScenarios = 0;
  let authoredSteps = 0;
  let executedScenarios = 0;
  let executedSteps = 0;
  const tagCounts: Record<string, number> = {};

  for (const r of marked) {
    authoredScenarios += r.examples;
    authoredSteps += r.steps.length * r.examples;
    if (r.executed) {
      executedScenarios += r.examples;
      executedSteps += r.steps.length * r.examples;
    }
    for (const t of r.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  }

  const adrs = parseAdrs();

  const perBus: string[] = [];
  for (let i = 0; i < PER_BUS_STAGES.length; i++) perBus.push(PER_BUS_STAGES[i]!);
  const downstream: string[] = [];
  for (let i = 0; i < DOWNSTREAM_STAGES.length; i++) downstream.push(DOWNSTREAM_STAGES[i]!);
  const order: string[] = [];
  for (let i = 0; i < STAGE_ORDER.length; i++) order.push(STAGE_ORDER[i]!);

  const stats = {
    generatedAt: new Date().toISOString(),
    scenarios: { authored: authoredScenarios, executed: executedScenarios },
    steps: { authored: authoredSteps, executed: executedSteps },
    featureFiles: featureFiles.length,
    adrs: adrs.length,
    tags: tagCounts,
    // Deliberately no unit-test count — see the header note.
  };

  const spine = {
    perBus,
    combine: COMBINE_STAGE,
    downstream,
    order,
    endpoints: { before: 'Source & Matte', after: 'Program Out' },
    note: 'Inner stages generated from src/core/signal-graph.ts; endpoints are authored diagram furniture.',
  };

  writeFileSync(join(OUT, 'stats.json'), JSON.stringify(stats, null, 2));
  writeFileSync(join(OUT, 'scenarios.json'), JSON.stringify({ scenarios: marked }, null, 2));
  writeFileSync(join(OUT, 'spine.json'), JSON.stringify(spine, null, 2));
  writeFileSync(join(OUT, 'adr.json'), JSON.stringify({ adrs }, null, 2));

  process.stdout.write(
    `site data written to site/generated/\n` +
      `  scenarios: ${executedScenarios} executed / ${authoredScenarios} authored\n` +
      `  steps:     ${executedSteps} executed / ${authoredSteps} authored\n` +
      `  features:  ${featureFiles.length}   ADRs: ${adrs.length}\n`,
  );
}

void main();
