#!/usr/bin/env node
// Keeps the team's shared docs the same on every branch, with main as the hub.
//
//   node scripts/docs-sync.mjs            check: show how this folder differs from main, change nothing
//   node scripts/docs-sync.mjs --pull     bring main's docs into this folder
//   node scripts/docs-sync.mjs --push     publish this folder's docs to main, and bring main's in
//
// The GitHub Action in .github/workflows/sync-docs.yml runs --push for you whenever a branch with changed
// shared docs is pushed, so running it by hand is only needed to publish right away.
//
// It never switches branches and never touches your other files. Pushing adds one commit on top of main
// that contains only the files listed in SHARED_FILES. UPDATES.md is an append-only log, so lines from both
// sides are kept and two people adding entries at the same time never conflict. The other files are merged
// normally; if two people changed the same lines, it stops and names the file to fix by hand. It also refuses
// a log that changes or removes entries main already has, because the log is append-only.
//
// To merge a doc that was edited in two places it needs the version both sides last had in common. That is
// where the branch left main, or the branch commit named in the "Docs-From:" line of this script's last
// commit on main. So every doc other than the log must be committed before it is published.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARED_FILES = [
  'UPDATES.md',
  'Mazen-Plan.md',
  'Meshal-Plan.md',
  'Resource.md',
  'AGENTS.md',
  'CLAUDE.md',
  '.gitattributes',
  'scripts/docs-sync.mjs',
  'scripts/docs-sync.test.mjs',
  '.github/workflows/sync-docs.yml',
];
/** GitHub does not let a workflow change files under .github/, so inside the Action they are left out. */
export const sharedFilesFor = (env = process.env) =>
  env.GITHUB_ACTIONS === 'true' ? SHARED_FILES.filter((name) => !name.startsWith('.github/')) : SHARED_FILES;
const LOG_FILES = new Set(['UPDATES.md']);
const MAX_PUSH_ATTEMPTS = 3;

export class SyncConflict extends Error {
  constructor(file, message) {
    super(message ?? `${file} was changed differently here and on main. Run "git pull origin main", fix ${file} by hand, then run this again.`);
    this.name = 'SyncConflict';
    this.file = file;
  }
}

/** The log is append-only: a copy that edits or drops a line main already has is refused, not published. */
export class LogRewritten extends SyncConflict {
  constructor(file, line) {
    super(
      file,
      `${file} is append-only, but this copy changes or removes a line that main has: "${line.trim().slice(0, 80)}". ` +
        `Restore the earlier entries (for example "git checkout origin/main -- ${file}", then add your entry again) and run this again.`,
    );
    this.name = 'LogRewritten';
  }
}

/** Merging a doc edited in two places needs a committed starting point, so unpublished edits must be committed first. */
export class UncommittedDoc extends SyncConflict {
  constructor(file) {
    super(file, `${file} has changes that are not committed yet. Commit it ("git add ${file}", then "git commit"), then run this again.`);
    this.name = 'UncommittedDoc';
  }
}

function git(cwd, args, { input, env, allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    input,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result;
}

// Merging happens on LF text; each file is written back in the line-ending style it already has.
const toLf = (text) => {
  const lf = text.replace(/\r\n/g, '\n');
  return lf === '' || lf.endsWith('\n') ? lf : `${lf}\n`;
};
const eolOf = (text) => (text !== null && text.includes('\r\n') ? '\r\n' : '\n');
const withEol = (lf, eol) => (eol === '\n' ? lf : lf.replace(/\n/g, eol));
const entryCount = (text) => (text.match(/^## \d{4}-\d{2}-\d{2} /gm) ?? []).length;

function showFile(cwd, ref, path) {
  if (!ref) return null;
  const result = git(cwd, ['show', `${ref}:${path}`], { allowFailure: true });
  return result.status === 0 ? result.stdout : null;
}

/** Three-way merge of one file on LF text. Returns the merged text; throws SyncConflict if it cannot. */
function mergeText(name, { base, mine, theirs }) {
  if (mine === null) return theirs; // not in this folder yet: take main's
  if (theirs === null) return mine; // new doc: publish it
  if (mine === theirs) return mine;
  if (base !== null && base === mine) return theirs; // only main changed it
  if (base !== null && base === theirs) return mine; // only this folder changed it

  const dir = mkdtempSync(join(tmpdir(), 'docs-merge-'));
  try {
    const files = { mine: join(dir, 'mine'), base: join(dir, 'base'), theirs: join(dir, 'theirs') };
    writeFileSync(files.mine, mine);
    writeFileSync(files.base, base ?? '');
    writeFileSync(files.theirs, theirs);
    // For the log, main's entries come first and yours follow, which keeps the log in the order things were published.
    const args = LOG_FILES.has(name)
      ? ['--union', '-L', 'main', '-L', 'base', '-L', 'this folder', files.theirs, files.base, files.mine]
      : ['-L', 'this folder', '-L', 'base', '-L', 'main', files.mine, files.base, files.theirs];
    const result = git(dir, ['merge-file', '-p', ...args], { allowFailure: true });
    if (result.status === 0) return result.stdout;
    if (result.status > 0) throw new SyncConflict(name);
    throw new Error(`git merge-file failed for ${name}: ${result.stderr.trim()}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every non-blank line of `before` must still be in `after`, in the same order. */
function assertOnlyGrows(name, before, after) {
  const kept = (text) => text.split('\n').filter((line) => line.trim() !== '');
  const wanted = kept(before);
  let found = 0;
  for (const line of kept(after)) if (found < wanted.length && line === wanted[found]) found += 1;
  if (found < wanted.length) throw new LogRewritten(name, wanted[found]);
}

function mergeFile(name, parts) {
  const merged = mergeText(name, parts);
  if (LOG_FILES.has(name) && parts.theirs !== null && merged !== null) assertOnlyGrows(name, parts.theirs, merged);
  return merged;
}

const isAncestor = (root, older, newer) => git(root, ['merge-base', '--is-ancestor', older, newer], { allowFailure: true }).status === 0;

/** Commits this script made on main, newest first, with the branch commit whose docs each one published. */
function publishedCommits(root) {
  const log = git(root, ['log', '-n', '300', '--format=%H%x1f%(trailers:key=Docs-From,valueonly)%x1e', 'origin/main'], { allowFailure: true });
  if (log.status !== 0) return [];
  return log.stdout
    .split('\x1e')
    .map((record) => record.trim().split('\x1f'))
    .map(([commit, from]) => ({ commit, from: (from ?? '').trim().split(/\s+/)[0] }))
    .filter((entry) => /^[0-9a-f]{40}$/.test(entry.from));
}

/** The newest commit in this branch's history whose docs main also had: where it left main, or its last publish. */
function chooseBase(root, published) {
  const candidates = [];
  const forkPoint = git(root, ['merge-base', 'HEAD', 'origin/main'], { allowFailure: true });
  if (forkPoint.status === 0) candidates.push(forkPoint.stdout.trim());
  const lastPublish = published.find((entry) => isAncestor(root, entry.from, 'HEAD'));
  if (lastPublish) candidates.push(lastPublish.from);
  let best = null;
  for (const candidate of candidates) if (best === null || isAncestor(root, best, candidate)) best = candidate;
  return best;
}

/** True if some recent commit reachable from `ref` had exactly this content for the file. */
function historyHas(root, ref, name, text) {
  const commits = git(root, ['log', '-n', '50', '--format=%H', ref, '--', name], { allowFailure: true }).stdout.split('\n').filter(Boolean);
  return commits.some((commit) => {
    const content = showFile(root, commit, name);
    return content !== null && toLf(content) === text;
  });
}

/** One commit on top of `parent` that changes only `changes`, built without touching any checkout. */
function buildCommit(root, parent, changes, branch, from) {
  const dir = mkdtempSync(join(tmpdir(), 'docs-index-'));
  const env = { GIT_INDEX_FILE: join(dir, 'index') };
  try {
    git(root, ['read-tree', parent], { env });
    for (const change of changes) {
      const existing = git(root, ['ls-tree', parent, '--', change.name], { allowFailure: true }).stdout.match(/^(\d{6}) /);
      // Store the bytes exactly as prepared: no line-ending conversion from this machine's git settings.
      const blob = git(root, ['hash-object', '-w', '--no-filters', '--stdin'], { input: change.forMain }).stdout.trim();
      git(root, ['update-index', '--add', '--cacheinfo', `${existing?.[1] ?? '100644'},${blob},${change.name}`], { env });
    }
    const tree = git(root, ['write-tree'], { env }).stdout.trim();
    const names = changes.map((change) => change.name);
    const subject = names.length === 1 ? `docs: sync ${names[0]} from ${branch}` : `docs: sync shared docs from ${branch}`;
    const body = `Files: ${names.join(', ')}\nPublished with scripts/docs-sync.mjs.`;
    // The trailer names the branch commit these docs came from; later runs use it to find the common starting point.
    const trailer = from ? `\n\nDocs-From: ${from}` : '';
    return git(root, ['commit-tree', tree, '-p', parent, '-m', `${subject}\n\n${body}${trailer}`]).stdout.trim();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeLocal(root, changes) {
  for (const change of changes) {
    const path = join(root, change.name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, change.forHere);
  }
}

/**
 * Compares this folder's shared docs with origin/main and, depending on `mode`, updates this folder
 * ('pull') or also publishes to main ('push'). `check` changes nothing. `beforePush` is a test hook.
 */
export function syncDocs({ cwd = process.cwd(), mode = 'check', files = sharedFilesFor(), beforePush } = {}) {
  const root = git(cwd, ['rev-parse', '--show-toplevel']).stdout.trim();
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
  const head = git(root, ['rev-parse', 'HEAD'], { allowFailure: true });
  const headSha = head.status === 0 ? head.stdout.trim() : null;

  for (let attempt = 1; ; attempt += 1) {
    const fetched = git(root, ['fetch', '--quiet', 'origin', 'main'], { allowFailure: true });
    if (fetched.status !== 0) throw new Error(`Could not fetch main from origin: ${fetched.stderr.trim()}`);
    const baseRef = chooseBase(root, publishedCommits(root));

    const plan = [];
    for (const name of files) {
      const rawMine = existsSync(join(root, name)) ? readFileSync(join(root, name), 'utf8') : null;
      const rawTheirs = showFile(root, 'origin/main', name);
      const mine = rawMine === null ? null : toLf(rawMine);
      const theirs = rawTheirs === null ? null : toLf(rawTheirs);
      const rawBase = showFile(root, baseRef, name);
      let base = rawBase === null ? null : toLf(rawBase);
      if (!LOG_FILES.has(name) && mine !== null && theirs !== null && mine !== theirs) {
        // One side is simply a version the other already had: main has not moved on (this copy is ahead),
        // or this copy is an old version of main's (it is behind). That is not a conflict, whatever the
        // history says. If both are true it is unclear which is newer, so the usual merge decides.
        const ahead = historyHas(root, 'HEAD', name, theirs);
        const behind = historyHas(root, 'origin/main', name, mine);
        if (ahead !== behind) base = ahead ? theirs : mine;
      }
      const merged = mergeFile(name, { base, mine, theirs });
      if (merged === null) continue;
      const entry = { name, mine, theirs, merged };
      entry.needsMain = merged !== theirs;
      entry.needsHere = merged !== mine;
      entry.forMain = withEol(merged, eolOf(rawTheirs)); // keep main's style; new files start as LF
      entry.forHere = withEol(merged, eolOf(rawMine ?? rawTheirs));
      plan.push(entry);
    }
    const forMain = plan.filter((entry) => entry.needsMain);
    const forHere = plan.filter((entry) => entry.needsHere);
    const result = { branch, plan, forMain, forHere, pushed: null };

    if (mode === 'check') return result;
    if (mode !== 'push' || forMain.length === 0) {
      writeLocal(root, forHere);
      return result;
    }

    // Every published doc except the log must be committed, so the next merge knows where this copy started.
    for (const entry of forMain) {
      if (LOG_FILES.has(entry.name) || entry.mine === null) continue;
      const committed = showFile(root, 'HEAD', entry.name);
      if (committed === null || toLf(committed) !== entry.mine) throw new UncommittedDoc(entry.name);
    }

    const commit = buildCommit(root, 'origin/main', forMain, branch, headSha);
    beforePush?.();
    const push = git(root, ['push', '--quiet', 'origin', `${commit}:refs/heads/main`], { allowFailure: true });
    if (push.status === 0) {
      writeLocal(root, forHere);
      git(root, ['fetch', '--quiet', 'origin', 'main'], { allowFailure: true });
      return { ...result, pushed: commit };
    }
    // Someone else pushed to main first: start again from their version.
    const raced = /rejected|fetch first|non-fast-forward/i.test(push.stderr);
    if (!raced || attempt >= MAX_PUSH_ATTEMPTS) throw new Error(`Could not push to main: ${push.stderr.trim()}`);
  }
}

function describeChange(entry, side) {
  const from = side === 'main' ? entry.theirs : entry.mine;
  if (from === null) return side === 'main' ? 'new on main' : 'new here';
  if (LOG_FILES.has(entry.name)) {
    const added = entryCount(entry.merged) - entryCount(from);
    if (added > 0) return `${added} new log ${added === 1 ? 'entry' : 'entries'}`;
  }
  return 'updated';
}

export function report(result, mode) {
  const lines = [`Shared docs on "${result.branch}" compared with main:`];
  const width = Math.max(28, ...result.plan.map((entry) => entry.name.length + 2));
  for (const entry of result.plan) {
    const parts = [];
    if (entry.needsMain) parts.push(`${mode === 'push' ? 'main gets' : 'main would get'}: ${describeChange(entry, 'main')}`);
    if (entry.needsHere) parts.push(`${mode === 'check' ? 'this folder would get' : 'this folder gets'}: ${describeChange(entry, 'here')}`);
    lines.push(`  ${entry.name.padEnd(width)}${parts.length ? parts.join(' · ') : 'in sync'}`);
  }
  if (result.pushed) lines.push(`Pushed ${result.pushed.slice(0, 7)} to main.`);
  else if (mode === 'check' && (result.forMain.length || result.forHere.length)) {
    lines.push('Nothing was changed. Use --pull to update this folder, or --push to publish to main as well.');
  } else if (mode === 'push' && !result.forMain.length) lines.push('Main already has everything from this folder.');
  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const known = new Set(['--push', '--pull', '--check']);
  if (args.some((arg) => !known.has(arg)) || (args.includes('--push') && args.includes('--pull'))) {
    console.error('Usage: node scripts/docs-sync.mjs [--check | --pull | --push]');
    process.exit(2);
  }
  const mode = args.includes('--push') ? 'push' : args.includes('--pull') ? 'pull' : 'check';
  try {
    console.log(report(syncDocs({ mode }), mode));
  } catch (error) {
    console.error(error.message);
    process.exit(error instanceof SyncConflict ? 3 : 1);
  }
}

const sameFile = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
if (process.argv[1] && sameFile(fileURLToPath(import.meta.url), resolve(process.argv[1]))) main();
