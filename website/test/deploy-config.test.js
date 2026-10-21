import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const site = join(import.meta.dirname, '..');
const read = (...parts) => readFileSync(join(site, ...parts), 'utf8');

test('the web server forwards only /v1 to the API, never the admin dashboard or docs', () => {
  const config = read('nginx', 'default.conf');
  const proxied = [...config.matchAll(/location\s+([^{]+)\{([^}]*)\}/g)].filter(([, , body]) => /proxy_pass/.test(body)).map(([, path]) => path.trim());
  assert.deepEqual(proxied, ['/v1/']);
  assert.match(config, /set \$ring http:\/\/infrastructure:3100;/);
});

test('every page and asset response gets the security headers, and scripts only run from the site itself', () => {
  const config = read('nginx', 'default.conf');
  const withHeaders = [...config.matchAll(/location\s+([^{]+)\{([^}]*)\}/g)].filter(([, , body]) => /headers\.inc/.test(body)).map(([, path]) => path.trim());
  assert.deepEqual(withHeaders.sort(), ['/', '/assets/']);
  const headers = read('nginx', 'headers.inc');
  const policy = headers.match(/Content-Security-Policy "([^"]+)"/)[1];
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /script-src 'self'(;|$)/, 'no inline or eval scripts');
  assert.doesNotMatch(policy, /unsafe-eval/);
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /connect-src 'self'(;|$)/, 'the page only talks to its own address');
  assert.match(headers, /X-Content-Type-Options "nosniff"/);
});

test('the container is published on loopback only and runs locked down', () => {
  const compose = read('compose.ring.yaml');
  assert.match(compose, /"127\.0\.0\.1:\$\{WEBSITE_PORT:-3101\}:8080"/);
  assert.match(compose, /read_only: true/);
  assert.match(compose, /cap_drop:\s*\n\s*- ALL/);
  assert.match(compose, /no-new-privileges:true/);
  assert.doesNotMatch(compose, /\n\s*- "?0\.0\.0\.0:/);
});

test('the image only receives the built site and the web server settings', () => {
  const dockerfile = read('Dockerfile');
  assert.deepEqual([...dockerfile.matchAll(/^COPY (\S+) /gm)].map((match) => match[1]), ['nginx/default.conf', 'nginx/headers.inc', 'dist/']);
  const ignore = read('.dockerignore').split(/\r?\n/);
  for (const name of ['node_modules', 'src', '.env']) assert.ok(ignore.includes(name), `${name} stays out of the image`);
});
