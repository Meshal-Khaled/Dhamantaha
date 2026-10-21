// Builds the website and puts it on The Ring (port 3101), then checks that it works.
//   npm run deploy:ring                 build, copy, rebuild the container, check
//   npm run deploy:ring -- --skip-build reuse the existing dist/
//   npm run deploy:ring -- --check      only check the site that is already running
// Needs `ssh ring` to work (the alias for The Ring in ~/.ssh/config) and Docker on The Ring.
// It never touches the API's own Compose project ("dhamantaha"); the website has its own ("dhamantaha-website").
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const site = resolve(import.meta.dirname, '..');
const args = new Set(process.argv.slice(2));
const PORT = 3101;
const FOLDER = 'dhamantaha/website';
const PROJECT = 'dhamantaha-website';
const COMPOSE = `docker compose -p ${PROJECT} -f compose.ring.yaml`;
const CONTAINER = `${PROJECT}-website-1`;

function local(command, commandArgs, options = {}) {
  const result = spawnSync(command, commandArgs, { cwd: site, stdio: 'inherit', shell: process.platform === 'win32' && command === 'npm', ...options });
  if (result.status !== 0) throw new Error(`${command} ${commandArgs.join(' ')} failed (${result.status ?? result.error?.message})`);
  return result;
}

/** Runs a shell command on The Ring and returns its output. Throws on a non-zero exit. */
function ring(command, { input, quiet = false } = {}) {
  const result = spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', 'ring', command], {
    cwd: site, input, encoding: input ? 'buffer' : 'utf8', maxBuffer: 200 * 1024 * 1024,
  });
  const out = `${result.stdout ?? ''}${result.stderr ?? ''}`.toString();
  if (!quiet && out.trim()) console.log(out.trimEnd());
  if (result.status !== 0) throw new Error(`On The Ring: ${command.slice(0, 120)} failed (${result.status})`);
  return out;
}

function check() {
  const url = `http://127.0.0.1:${PORT}`;
  const probes = [
    ['health check answers', `curl -fsS ${url}/healthz`, (out) => out.trim() === 'ok'],
    ['home page is the app', `curl -fsS ${url}/`, (out) => out.includes('<div id="root">')],
    ['a page address falls back to the app', `curl -fsS ${url}/receipts/example`, (out) => out.includes('<div id="root">')],
    ['a missing file is a real 404', `curl -s -o /dev/null -w '%{http_code}' ${url}/assets/missing.js`, (out) => out.trim() === '404'],
    ['the API answers through /v1', `curl -fsS ${url}/v1/health`, (out) => out.includes('"status":"ok"')],
    ['the admin dashboard is not reachable through the website', `curl -fsS ${url}/dashboard/api-settings`, (out) => out.includes('<div id="root">') && !out.toLowerCase().includes('monitoring')],
    ['a 15 MB upload reaches the API (answers 401 without a key, not 413 from the web server)',
      `head -c 15000000 /dev/zero | curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/octet-stream' --data-binary @- ${url}/v1/receipts/analyze`,
      (out) => ['401', '400', '415'].includes(out.trim())],
    ['security headers are sent', `curl -sI ${url}/ | tr -d '\\r'`, (out) => /content-security-policy/i.test(out) && /x-frame-options: DENY/i.test(out) && /cache-control: no-cache/i.test(out)],
    ['built files are cached for a year', `curl -sI ${url}/$(curl -fsS ${url}/ | grep -o 'assets/[^"]*\\.js' | head -1) | tr -d '\\r'`, (out) => /cache-control: public, max-age=31536000, immutable/i.test(out)],
  ];
  let failed = 0;
  for (const [name, command, passes] of probes) {
    let out = '';
    try { out = ring(command, { quiet: true }); } catch (error) { out = error.message; }
    const ok = passes(out);
    if (!ok) failed++;
    console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok ? '' : `\n         got: ${out.trim().slice(0, 200)}`}`);
  }
  if (failed) throw new Error(`${failed} check(s) failed`);
}

try {
  if (!args.has('--check')) {
    if (!args.has('--skip-build')) local('npm', ['run', 'build']);
    if (!existsSync(resolve(site, 'dist', 'index.html'))) throw new Error('dist/index.html is missing. Run npm run build first.');

    console.log('\nCopying the site to The Ring…');
    const pack = spawnSync('tar', ['-cf', '-', 'Dockerfile', '.dockerignore', 'compose.ring.yaml', 'nginx', 'dist'], { cwd: site, maxBuffer: 200 * 1024 * 1024 });
    if (pack.status !== 0) throw new Error(`tar failed: ${pack.stderr}`);
    ring(`mkdir -p ~/${FOLDER} && cd ~/${FOLDER} && rm -rf dist nginx && tar -xf -`, { input: pack.stdout });

    console.log('\nBuilding and starting the container…');
    ring(`cd ~/${FOLDER} && (docker image inspect ${PROJECT}:latest >/dev/null 2>&1 && docker tag ${PROJECT}:latest ${PROJECT}:previous || true) && ${COMPOSE} build 2>&1 | tail -5`);
    ring(`docker run --rm --entrypoint nginx ${PROJECT}:latest -t 2>&1`);
    ring(`cd ~/${FOLDER} && ${COMPOSE} up -d 2>&1`);

    console.log('\nWaiting for it to be healthy…');
    let status = '';
    for (let i = 0; i < 40 && status !== 'healthy'; i++) {
      status = ring(`docker inspect -f '{{.State.Health.Status}}' ${CONTAINER}`, { quiet: true }).trim();
      if (status !== 'healthy') spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 1500)']);
    }
    if (status !== 'healthy') throw new Error(`The container is "${status}", not healthy. See: ssh ring docker logs ${CONTAINER}`);
  }

  console.log('\nChecking the running site…');
  check();
  console.log(`\nThe website is running on The Ring at http://127.0.0.1:${PORT} (this machine's loopback only).`);
  console.log('Cloudflare Tunnel → Public hostname → Service: HTTP → localhost:3101 makes it public.');
} catch (error) {
  console.error(`\n${error.message}`);
  process.exit(1);
}
