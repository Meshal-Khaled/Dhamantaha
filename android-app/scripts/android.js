// Build, install, and tail logs for the Android app without opening Android Studio.
//   node scripts/android.js build     web build + cap sync + gradle assembleDebug
//   node scripts/android.js install   build, then adb install -r and launch on the connected phone
//   node scripts/android.js logs      adb logcat filtered to the app's console output
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk');
const adb = join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const apk = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const APP_ID = 'com.dhamantaha.app';

function findJava() {
  if (process.env.JAVA_HOME && existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const candidates = [];
  const jdks = join(homedir(), '.jdks');
  if (existsSync(jdks)) candidates.push(...readdirSync(jdks).map((d) => join(jdks, d)));
  candidates.push('C:\\Program Files\\Android\\Android Studio\\jbr');
  const home = candidates.find((d) => existsSync(join(d, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')));
  if (!home) throw new Error('No JDK 21 found. Set JAVA_HOME.');
  return home;
}

function run(command, args, options = {}) {
  // .bat files (gradlew.bat) and npx need a shell on Windows; quote the path in case it has spaces.
  const viaShell = process.platform === 'win32' && !command.endsWith('.exe');
  const result = spawnSync(viaShell && /[\/ ]/.test(command) ? `"${command}"` : command, args, { stdio: 'inherit', cwd: root, shell: viaShell, ...options });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? result.error?.message})`);
}

function build() {
  const env = { ...process.env, JAVA_HOME: findJava(), ANDROID_HOME: sdk };
  run('npx', ['vite', 'build'], { env });
  run('npx', ['cap', 'sync', 'android'], { env });
  const gradlew = join(root, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  run(gradlew, ['assembleDebug'], { env, cwd: join(root, 'android') });
}

function install() {
  build();
  run(adb, ['install', '-r', apk]);
  run(adb, ['shell', 'monkey', '-p', APP_ID, '-c', 'android.intent.category.LAUNCHER', '1']);
}

function logs() {
  run(adb, ['logcat', '-c']);
  run(adb, ['logcat', '-v', 'time', 'Capacitor/Console:V', 'chromium:I', 'AndroidRuntime:E', '*:S']);
}

const actions = { build, install, logs };
const action = actions[process.argv[2]];
if (!action) {
  console.error('Usage: node scripts/android.js <build|install|logs>');
  process.exit(2);
}
try {
  action();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
