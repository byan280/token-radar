// token-radar-01 entry point: score the sealed snapshot and lay out the output.
//
// Run it from this directory, pointing at the sealed snapshot:
//   MAKEFUN_OUTPUT_DIR=out node main.ts --input ../kit/input/snapshot.json
// The scoring model lives in lib/model.ts and the dossier writer in
// vendor/makefun-board.ts. Standard library only, no build, no install.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath as urlToPath } from 'node:url';
import { buildRadar, boardIssue, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier as makeDossier } from './vendor/makefun-board.ts';

const repoRoot = urlToPath(new URL('.', import.meta.url));

/** Caps the scorer holds the output to (reference/gate.json): the text cap shapes bytes, the rest refuse. */
const TEXT_CAP_BYTES = 65_536;
const SHOT_LIMIT = { max: 4, max_bytes: 524_288 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** A `--flag value` or `--flag=value` argument, or the fallback when neither is given. */
function flagValue(flag: string, fallback: string): string {
  const wanted = '--' + flag;
  const at = process.argv.indexOf(wanted);
  if (at !== -1 && at + 1 < process.argv.length) {
    const next = process.argv[at + 1];
    if (next !== undefined) return next;
  }
  const joined = process.argv.find((a) => a.startsWith(wanted + '='));
  if (joined !== undefined) return joined.slice(wanted.length + 1);
  return fallback;
}

const inputFlag = flagValue('input', '/input');
const snapshotPath = inputFlag.endsWith('.json') ? inputFlag : path.join(inputFlag, 'snapshot.json');
if (!fs.existsSync(snapshotPath)) {
  const hint = 'token radar: no snapshot at ' + snapshotPath + ': pass --input <snapshot.json|directory> or mount the sealed /input\n';
  process.stderr.write(hint);
  process.exit(2);
}
const outputDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(fs.readFileSync(snapshotPath, 'utf8'));
const scored = buildRadar(snapshot);
const board = scored.board;
const radar = scored.radar;
const problem = boardIssue(board, snapshot);
if (problem !== null) {
  process.stderr.write('token radar: the model wrote a board the gate refuses: ' + problem + '\n');
  process.exit(1);
}

fs.mkdirSync(outputDir, { recursive: true });
const boardJson = JSON.stringify({ rows: board });
fs.writeFileSync(path.join(outputDir, 'board.json'), boardJson + '\n');
fs.writeFileSync(path.join(outputDir, 'data.js'), dataScript(radar));

/** Copy a directory's regular files into `dest`, skipping dot-names; returns the copied names. */
function copyDirFiles(src: string, dest: string): string[] {
  if (!fs.existsSync(src)) return [];
  fs.mkdirSync(dest, { recursive: true });
  const names: string[] = [];
  const entries = fs.readdirSync(src);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as string;
    if (entry.startsWith('.')) continue;
    const from = path.join(src, entry);
    if (!fs.statSync(from).isFile()) continue;
    fs.copyFileSync(from, path.join(dest, entry));
    names.push(entry);
  }
  return names;
}

copyDirFiles(path.join(repoRoot, 'dashboard'), path.join(outputDir, 'dashboard'));
const shots = copyDirFiles(path.join(repoRoot, 'screenshots'), path.join(outputDir, 'screenshots'));
if (shots.length < 3) {
  // Rescue for a snapshot whose screenshots never reached screenshots/:
  // the uploader left the images at the repository root instead. Copy
  // them in with sanitized names (the dossier's alphabet). Dormant when
  // screenshots/ already holds 3, so a complete entry is byte-identical.
  fs.mkdirSync(path.join(outputDir, 'screenshots'), { recursive: true });
  const taken = new Set(shots);
  const rootEntries = fs.readdirSync(repoRoot).sort();
  for (const entry of rootEntries) {
    if (shots.length >= 4) break;
    if (entry.startsWith('.')) continue;
    if (!/\.(png|jpe?g)$/i.test(entry)) continue;
    const from = path.join(repoRoot, entry);
    if (!fs.statSync(from).isFile()) continue;
    let name = entry.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 128);
    while (name.length > 0 && !/^[A-Za-z0-9_]/.test(name)) name = name.slice(1);
    if (name.length === 0) continue;
    if (taken.has(name)) continue;
    fs.copyFileSync(from, path.join(outputDir, 'screenshots', name));
    taken.add(name);
    shots.push(name);
  }
}
if (shots.length < 3) {
  const only = shots.length === 1 ? '' : 's';
  process.stderr.write('token radar: screenshots/ holds ' + shots.length + ' image' + only + ': hand in 3, the board, a detail view and a filtered view\n');
  process.exit(1);
}
for (const shot of shots) {
  if (!SHOT_NAME.test(shot)) {
    process.stderr.write('token radar: screenshots/' + shot + ': a name is letters, digits and . _ -, 1 to 128 characters\n');
    process.exit(1);
  }
}

// The dossier goes last: the scorer rebuilds it from this output and compares bytes.
const dossierCaps = { text_max_bytes: TEXT_CAP_BYTES, screenshots: SHOT_LIMIT, dashboard: { max_files: 400, max_bytes: 4_194_304 } };
fs.writeFileSync(path.join(outputDir, 'dossier.json'), makeDossier(outputDir, dossierCaps));

const summaryA = 'token radar: ' + snapshot.protocols.length + ' protocols, ' + snapshot.watchlist.length + ' on the watchlist, ' + board.length + ' rows scored (' + radar.early_size + ' early, ' + radar.live_size + ' live set aside)\n';
const summaryB = 'token radar: wrote ' + path.join(outputDir, 'board.json') + ', ' + path.join(outputDir, 'data.js') + ', ' + path.join(outputDir, 'dashboard') + ' (3 files), ' + path.join(outputDir, 'screenshots') + ' (' + shots.length + ' images) and ' + path.join(outputDir, 'dossier.json') + '\n';
process.stdout.write(summaryA + summaryB);
