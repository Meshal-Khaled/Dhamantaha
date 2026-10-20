import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LogRewritten, report, SHARED_FILES, sharedFilesFor, SyncConflict, syncDocs, UncommittedDoc } from './docs-sync.mjs';

// Every repository here is a throwaway under the system temp folder. Nothing touches a real remote,
// and the machine's own git configuration is ignored so the results do not depend on it.
const sandbox = mkdtempSync(join(tmpdir(), 'docs-sync-tests-'));
writeFileSync(join(sandbox, 'gitconfig'), '[user]\n\tname = Test User\n\temail = test@example.com\n');
process.env.GIT_CONFIG_GLOBAL = join(sandbox, 'gitconfig');
process.env.GIT_CONFIG_NOSYSTEM = '1';
after(() => rmSync(sandbox, { recursive: true, force: true }));

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptsDir, '..');

function sh(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr || result.stdout}`);
  return result.stdout;
}
const tryGit = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

const HEADER = '# Updates\n\n## Rules\n\n- Append only.\n';
const entry = (time, text) => `\n## 2026-10-20 ${time} (Asia/Riyadh)\n\n**Update:** ${text}\n\nTool: Test — Developer: Someone\n`;
const headings = (text) => [...text.matchAll(/^## 2026-10-20 (\d\d:\d\d)/gm)].map((match) => match[1]);

let counter = 0;
/** A bare origin with main, plus clones on their own branches, like Meshal's and the friend's folders. */
function team({ log = HEADER + entry('10:00', 'first'), eol = '\n', plan = 'Plan\nline two\nline three\n' } = {}) {
  const dir = join(sandbox, `team-${(counter += 1)}`);
  mkdirSync(dir);
  const origin = join(dir, 'origin.git');
  sh(dir, 'init', '--bare', '-b', 'main', origin);

  const seed = join(dir, 'seed');
  sh(dir, 'clone', '-q', origin, seed);
  sh(seed, 'config', 'core.autocrlf', 'false');
  writeFileSync(join(seed, 'UPDATES.md'), log.replace(/\n/g, eol));
  writeFileSync(join(seed, 'Meshal-Plan.md'), plan.replace(/\n/g, eol));
  sh(seed, 'add', '.');
  sh(seed, 'commit', '-q', '-m', 'docs');
  sh(seed, 'push', '-q', 'origin', 'HEAD:main');

  const clone = (name) => {
    const path = join(dir, name);
    sh(dir, 'clone', '-q', '-b', 'main', origin, path);
    sh(path, 'switch', '-q', '-c', name);
    return path;
  };
  const infra = clone('infra');
  mkdirSync(join(infra, 'app'));
  writeFileSync(join(infra, 'app', 'code.js'), 'export const x = 1;\n'); // code that must never reach main
  sh(infra, 'add', '.');
  sh(infra, 'commit', '-q', '-m', 'code');
  const front = clone('front');

  const onMain = (file) => sh(origin, 'show', `main:${file}`);
  const append = (folder, file, text) => writeFileSync(join(folder, file), readFileSync(join(folder, file), 'utf8') + text);
  return { dir, origin, seed, infra, front, onMain, append, mainSha: () => sh(origin, 'rev-parse', 'main').trim() };
}

describe('docs-sync', () => {
  it('check shows what would change and changes nothing', () => {
    const t = team();
    t.append(t.infra, 'UPDATES.md', entry('11:00', 'from infra'));
    const before = t.mainSha();
    const result = syncDocs({ cwd: t.infra, mode: 'check' });

    assert.deepEqual(result.forMain.map((file) => file.name), ['UPDATES.md']);
    assert.equal(t.mainSha(), before);
    assert.deepEqual(headings(readFileSync(join(t.infra, 'UPDATES.md'), 'utf8')), ['10:00', '11:00']);
    const text = report(result, 'check');
    assert.match(text, /UPDATES\.md\s+main would get: 1 new log entry/);
    assert.match(text, /Nothing was changed/);
  });

  it('push publishes the entry to main as a docs-only commit and leaves the branch alone', () => {
    const t = team();
    t.append(t.infra, 'UPDATES.md', entry('11:00', 'from infra'));
    const branchBefore = sh(t.infra, 'rev-parse', 'HEAD');
    const result = syncDocs({ cwd: t.infra, mode: 'push' });

    assert.ok(result.pushed);
    assert.deepEqual(headings(t.onMain('UPDATES.md')), ['10:00', '11:00']);
    assert.deepEqual(sh(t.origin, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n').sort(), ['Meshal-Plan.md', 'UPDATES.md']);
    assert.equal(sh(t.origin, 'log', '-1', '--format=%s', 'main').trim(), 'docs: sync UPDATES.md from infra');
    assert.equal(sh(t.infra, 'rev-parse', 'HEAD'), branchBefore);
    assert.equal(sh(t.infra, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'infra');
    assert.match(report(result, 'push'), /Pushed [0-9a-f]{7} to main\./);
  });

  it('keeps entries from two people on different branches, in the order they were published', () => {
    const t = team();
    t.append(t.infra, 'UPDATES.md', entry('11:00', 'from infra'));
    syncDocs({ cwd: t.infra, mode: 'push' });
    t.append(t.front, 'UPDATES.md', entry('11:30', 'from the friend'));
    syncDocs({ cwd: t.front, mode: 'push' });

    assert.deepEqual(headings(t.onMain('UPDATES.md')), ['10:00', '11:00', '11:30']);
    // The friend's own copy now has the infra entry too; infra gets the friend's on its next pull.
    assert.deepEqual(headings(readFileSync(join(t.front, 'UPDATES.md'), 'utf8')), ['10:00', '11:00', '11:30']);
    syncDocs({ cwd: t.infra, mode: 'pull' });
    assert.deepEqual(headings(readFileSync(join(t.infra, 'UPDATES.md'), 'utf8')), ['10:00', '11:00', '11:30']);
  });

  it('retries from the new version when someone else pushes to main first', () => {
    const t = team();
    t.append(t.infra, 'UPDATES.md', entry('11:00', 'from infra'));
    let raced = false;
    syncDocs({
      cwd: t.infra,
      mode: 'push',
      beforePush: () => {
        if (raced) return;
        raced = true;
        sh(t.seed, 'pull', '-q', 'origin', 'main');
        t.append(t.seed, 'UPDATES.md', entry('10:30', 'pushed while we were publishing'));
        sh(t.seed, 'commit', '-q', '-am', 'another entry');
        sh(t.seed, 'push', '-q', 'origin', 'HEAD:main');
      },
    });
    assert.deepEqual(headings(t.onMain('UPDATES.md')), ['10:00', '10:30', '11:00']);
  });

  it('stops on a real conflict in a plan and pushes nothing', () => {
    const t = team();
    sh(t.seed, 'pull', '-q', 'origin', 'main');
    writeFileSync(join(t.seed, 'Meshal-Plan.md'), 'Plan\nline two CHANGED ON MAIN\nline three\n');
    sh(t.seed, 'commit', '-q', '-am', 'edit plan');
    sh(t.seed, 'push', '-q', 'origin', 'HEAD:main');
    writeFileSync(join(t.infra, 'Meshal-Plan.md'), 'Plan\nline two CHANGED HERE\nline three\n');
    sh(t.infra, 'commit', '-q', '-am', 'edit plan here');
    const before = t.mainSha();

    assert.throws(() => syncDocs({ cwd: t.infra, mode: 'push' }), (error) => error instanceof SyncConflict && error.file === 'Meshal-Plan.md');
    assert.equal(t.mainSha(), before);
  });

  it('merges plan edits made in different places', () => {
    const t = team();
    sh(t.seed, 'pull', '-q', 'origin', 'main');
    writeFileSync(join(t.seed, 'Meshal-Plan.md'), 'Plan EDITED ON MAIN\nline two\nline three\n');
    sh(t.seed, 'commit', '-q', '-am', 'edit plan');
    sh(t.seed, 'push', '-q', 'origin', 'HEAD:main');
    writeFileSync(join(t.infra, 'Meshal-Plan.md'), 'Plan\nline two\nline three EDITED HERE\n');
    sh(t.infra, 'commit', '-q', '-am', 'edit plan here');
    syncDocs({ cwd: t.infra, mode: 'push' });

    assert.equal(t.onMain('Meshal-Plan.md'), 'Plan EDITED ON MAIN\nline two\nline three EDITED HERE\n');
    assert.equal(readFileSync(join(t.infra, 'Meshal-Plan.md'), 'utf8'), 'Plan EDITED ON MAIN\nline two\nline three EDITED HERE\n');
  });

  it('pull brings main\'s docs into a folder that lacks them, and never loses local entries', () => {
    const t = team();
    sh(t.seed, 'pull', '-q', 'origin', 'main');
    writeFileSync(join(t.seed, 'AGENTS.md'), '# Rules\n');
    sh(t.seed, 'add', 'AGENTS.md');
    sh(t.seed, 'commit', '-q', '-m', 'agents');
    sh(t.seed, 'push', '-q', 'origin', 'HEAD:main');
    t.append(t.front, 'UPDATES.md', entry('12:00', 'local, unpublished'));
    const before = t.mainSha();

    syncDocs({ cwd: t.front, mode: 'pull' });
    assert.equal(readFileSync(join(t.front, 'AGENTS.md'), 'utf8'), '# Rules\n');
    assert.deepEqual(headings(readFileSync(join(t.front, 'UPDATES.md'), 'utf8')), ['10:00', '12:00']);
    assert.equal(t.mainSha(), before); // pull never publishes
  });

  it('keeps the CRLF line endings main already uses, so the commit adds only the new lines', () => {
    const t = team({ eol: '\r\n' });
    sh(t.infra, 'config', 'core.autocrlf', 'true'); // like Meshal's machine
    t.append(t.infra, 'UPDATES.md', entry('11:00', 'from infra')); // appended with plain LF
    syncDocs({ cwd: t.infra, mode: 'push' });

    const published = t.onMain('UPDATES.md');
    assert.equal(published.replace(/\r\n/g, '').includes('\n'), false, 'no bare LF line endings on main');
    assert.deepEqual(headings(published), ['10:00', '11:00']);
    const [added, removed] = sh(t.origin, 'diff', '--numstat', 'main~1', 'main', '--', 'UPDATES.md').trim().split(/\s+/);
    assert.equal(removed, '0');
    assert.ok(Number(added) > 0);
  });

  it('refuses a log that edits or drops entries main already has, and pushes nothing', () => {
    const t = team({ log: HEADER + entry('10:00', 'first') + entry('10:30', 'second') });
    const before = t.mainSha();
    const log = join(t.infra, 'UPDATES.md');

    writeFileSync(log, readFileSync(log, 'utf8').replace('**Update:** first', '**Update:** first, reworded'));
    assert.throws(
      () => syncDocs({ cwd: t.infra, mode: 'push' }),
      (error) => error instanceof LogRewritten && error instanceof SyncConflict && error.file === 'UPDATES.md' && /append-only/.test(error.message),
    );

    writeFileSync(log, HEADER + entry('10:00', 'first')); // the 10:30 entry is gone
    assert.throws(() => syncDocs({ cwd: t.infra, mode: 'push' }), LogRewritten);
    assert.equal(t.mainSha(), before);
  });

  it('accepts a log checked out with Windows line endings', () => {
    const t = team();
    const log = join(t.infra, 'UPDATES.md');
    writeFileSync(log, (readFileSync(log, 'utf8') + entry('11:00', 'from infra')).replace(/\n/g, '\r\n'));
    syncDocs({ cwd: t.infra, mode: 'push' });

    assert.deepEqual(headings(t.onMain('UPDATES.md')), ['10:00', '11:00']);
    assert.equal(t.onMain('UPDATES.md').includes('\r'), false, 'main keeps its own line endings');
  });

  it('refuses to publish a plan with uncommitted edits, and says what to do', () => {
    const t = team();
    writeFileSync(join(t.infra, 'Meshal-Plan.md'), 'Plan\nline two EDITED\nline three\n');
    const before = t.mainSha();
    assert.throws(
      () => syncDocs({ cwd: t.infra, mode: 'push' }),
      (error) => error instanceof UncommittedDoc && error.file === 'Meshal-Plan.md' && /git commit/.test(error.message),
    );
    assert.equal(t.mainSha(), before);
    // The log is the exception: new entries can be published before they are committed.
    t.append(t.infra, 'UPDATES.md', entry('11:00', 'uncommitted entry'));
    sh(t.infra, 'checkout', '--', 'Meshal-Plan.md');
    assert.ok(syncDocs({ cwd: t.infra, mode: 'push' }).pushed);
  });

  it('records the branch commit it published in a Docs-From line on main', () => {
    const t = team();
    t.append(t.infra, 'UPDATES.md', entry('11:00', 'from infra'));
    syncDocs({ cwd: t.infra, mode: 'push' });
    const message = sh(t.origin, 'log', '-1', '--format=%B', 'main');
    assert.match(message, new RegExp(`\\n\\nDocs-From: ${sh(t.infra, 'rev-parse', 'HEAD').trim()}\\n*$`));
  });

  it('lets one branch keep editing and publishing the same line of a plan', () => {
    const t = team();
    for (const word of ['one', 'two', 'three']) {
      writeFileSync(join(t.infra, 'Meshal-Plan.md'), `Plan\nline two ${word}\nline three\n`);
      sh(t.infra, 'commit', '-q', '-am', `plan ${word}`);
      syncDocs({ cwd: t.infra, mode: 'push' });
      assert.equal(t.onMain('Meshal-Plan.md'), `Plan\nline two ${word}\nline three\n`);
    }
  });

  it('keeps going after a publish that was not committed first, as older versions of the script allowed', () => {
    const t = team();
    // main already has a version of the plan that this branch also committed (no Docs-From line on it)
    writeFileSync(join(t.infra, 'Meshal-Plan.md'), 'Plan\nline two V1\nline three\n');
    sh(t.infra, 'commit', '-q', '-am', 'plan v1');
    sh(t.seed, 'pull', '-q', 'origin', 'main');
    writeFileSync(join(t.seed, 'Meshal-Plan.md'), 'Plan\nline two V1\nline three\n');
    sh(t.seed, 'commit', '-q', '-am', 'v1 published by hand');
    sh(t.seed, 'push', '-q', 'origin', 'HEAD:main');
    writeFileSync(join(t.infra, 'Meshal-Plan.md'), 'Plan\nline two V2\nline three\n');
    sh(t.infra, 'commit', '-q', '-am', 'plan v2');

    syncDocs({ cwd: t.infra, mode: 'push' });
    assert.equal(t.onMain('Meshal-Plan.md'), 'Plan\nline two V2\nline three\n');
  });

  it('merges edits made in two places after an earlier publish, using the last published version as the start', () => {
    // Lines are kept apart by unchanged lines: git treats edits to neighbouring lines as a conflict.
    const t = team({ plan: 'p1\np2\np3\np4\np5\n' });
    const plan = (one, three, five) => `${one}\np2\n${three}\np4\n${five}\n`;
    // infra edits line one and publishes
    writeFileSync(join(t.infra, 'Meshal-Plan.md'), plan('ONE by infra', 'p3', 'p5'));
    sh(t.infra, 'commit', '-q', '-am', 'infra edit');
    syncDocs({ cwd: t.infra, mode: 'push' });
    // the friend, who has not seen that, edits line five and publishes
    writeFileSync(join(t.front, 'Meshal-Plan.md'), plan('p1', 'p3', 'FIVE by friend'));
    sh(t.front, 'commit', '-q', '-am', 'friend edit');
    syncDocs({ cwd: t.front, mode: 'push' });
    assert.equal(t.onMain('Meshal-Plan.md'), plan('ONE by infra', 'p3', 'FIVE by friend'));
    // infra, still without the friend's edit, changes line three and publishes again: nothing is lost
    writeFileSync(join(t.infra, 'Meshal-Plan.md'), plan('ONE by infra', 'THREE by infra', 'p5'));
    sh(t.infra, 'commit', '-q', '-am', 'infra edit again');
    syncDocs({ cwd: t.infra, mode: 'push' });

    const all = plan('ONE by infra', 'THREE by infra', 'FIVE by friend');
    assert.equal(t.onMain('Meshal-Plan.md'), all);
    assert.equal(readFileSync(join(t.infra, 'Meshal-Plan.md'), 'utf8'), all);
  });

  it('takes main\'s newer plan when this copy is just an old version of it', () => {
    const t = team();
    sh(t.seed, 'pull', '-q', 'origin', 'main');
    writeFileSync(join(t.seed, 'Meshal-Plan.md'), 'Plan\nline two NEWER\nline three\n');
    sh(t.seed, 'commit', '-q', '-am', 'newer plan');
    sh(t.seed, 'push', '-q', 'origin', 'HEAD:main');
    const before = t.mainSha();

    const result = syncDocs({ cwd: t.front, mode: 'push' }); // the friend's copy is still the original
    assert.equal(result.forMain.length, 0);
    assert.equal(t.mainSha(), before);
    assert.equal(readFileSync(join(t.front, 'Meshal-Plan.md'), 'utf8'), 'Plan\nline two NEWER\nline three\n');
  });

  it('reports in sync once everything is published', () => {
    const t = team();
    t.append(t.infra, 'UPDATES.md', entry('11:00', 'from infra'));
    syncDocs({ cwd: t.infra, mode: 'push' });
    const again = syncDocs({ cwd: t.infra, mode: 'push' });
    assert.equal(again.forMain.length, 0);
    assert.equal(again.pushed, null);
    assert.match(report(again, 'push'), /Main already has everything/);
    assert.match(report(syncDocs({ cwd: t.infra, mode: 'check' }), 'check'), /UPDATES\.md\s+in sync/);
  });
});

describe('GitHub Action', () => {
  const workflow = readFileSync(join(repoRoot, '.github', 'workflows', 'sync-docs.yml'), 'utf8').replace(/\r\n/g, '\n');
  const runScript = (cwd, extraEnv = {}) =>
    spawnSync(process.execPath, [join(scriptsDir, 'docs-sync.mjs'), '--push'], { cwd, encoding: 'utf8', env: { ...process.env, ...extraEnv } });

  it('triggers on exactly the shared files and never on main itself', () => {
    const block = workflow.match(/\n {4}paths:\n((?: {6}- .+\n)+)/)?.[1] ?? '';
    const paths = [...block.matchAll(/- (.+)/g)].map((match) => match[1].trim());
    assert.deepEqual([...paths].sort(), [...SHARED_FILES].sort());
    assert.match(workflow, /branches-ignore:\n\s+- main\n/);
    assert.match(workflow, /contents: write/);
    assert.match(workflow, /node scripts\/docs-sync\.mjs --push/);
    assert.match(workflow, /fetch-depth: 0/);
  });

  it('leaves the workflow file itself out when it runs inside GitHub Actions', () => {
    assert.deepEqual(sharedFilesFor({}), SHARED_FILES);
    const inCi = sharedFilesFor({ GITHUB_ACTIONS: 'true' });
    assert.ok(SHARED_FILES.some((name) => name.startsWith('.github/')));
    assert.ok(inCi.every((name) => !name.startsWith('.github/')));
    assert.equal(inCi.length, SHARED_FILES.length - 1);
  });

  it('publishes the docs from the command line as the Action does, but not the workflow file', () => {
    const t = team();
    mkdirSync(join(t.infra, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(t.infra, '.github', 'workflows', 'sync-docs.yml'), 'name: changed\n');
    sh(t.infra, 'add', '.github');
    sh(t.infra, 'commit', '-q', '-m', 'workflow');
    t.append(t.infra, 'UPDATES.md', entry('11:00', 'from infra'));

    const inCi = runScript(t.infra, { GITHUB_ACTIONS: 'true' });
    assert.equal(inCi.status, 0, inCi.stderr);
    assert.deepEqual(headings(t.onMain('UPDATES.md')), ['10:00', '11:00']);
    assert.notEqual(tryGit(t.origin, 'cat-file', '-e', 'main:.github/workflows/sync-docs.yml').status, 0, 'the Action must not push workflow files');

    const local = runScript(t.infra, { GITHUB_ACTIONS: '' });
    assert.equal(local.status, 0, local.stderr);
    assert.equal(t.onMain('.github/workflows/sync-docs.yml'), 'name: changed\n');
  });

  it('exits non-zero with the reason when the log was rewritten', () => {
    const t = team();
    writeFileSync(join(t.infra, 'UPDATES.md'), HEADER); // drops the first entry
    const result = runScript(t.infra);
    assert.equal(result.status, 3);
    assert.match(result.stderr, /append-only/);
  });
});

describe('.gitattributes', () => {
  /** Two branches each add a log entry; merge one into the other. */
  function mergeTwoBranches({ withAttributes }) {
    const dir = join(sandbox, `attributes-${withAttributes ? 'on' : 'off'}`);
    mkdirSync(dir);
    sh(dir, 'init', '-q', '-b', 'main');
    writeFileSync(join(dir, 'UPDATES.md'), HEADER + entry('10:00', 'first'));
    if (withAttributes) copyFileSync(join(repoRoot, '.gitattributes'), join(dir, '.gitattributes'));
    sh(dir, 'add', '.');
    sh(dir, 'commit', '-q', '-m', 'start');
    for (const [branch, time] of [['infra', '11:00'], ['front', '11:30']]) {
      sh(dir, 'switch', '-q', '-c', branch, 'main');
      writeFileSync(join(dir, 'UPDATES.md'), readFileSync(join(dir, 'UPDATES.md'), 'utf8') + entry(time, `from ${branch}`));
      sh(dir, 'commit', '-q', '-am', branch);
    }
    sh(dir, 'switch', '-q', 'infra');
    const merge = tryGit(dir, 'merge', '--no-edit', 'front');
    return { merge, text: readFileSync(join(dir, 'UPDATES.md'), 'utf8') };
  }

  it('lets git merge keep both entries when two branches add one at the same time', () => {
    const { merge, text } = mergeTwoBranches({ withAttributes: true });
    assert.equal(merge.status, 0, merge.stdout + merge.stderr);
    assert.deepEqual(headings(text), ['10:00', '11:00', '11:30']);
    assert.doesNotMatch(text, /<<<<<<<|>>>>>>>/);
  });

  it('would conflict without it (control)', () => {
    const { merge } = mergeTwoBranches({ withAttributes: false });
    assert.notEqual(merge.status, 0);
  });
});
