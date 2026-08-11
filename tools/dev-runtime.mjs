import { existsSync, readFileSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeStatePath = resolve(projectRoot, '.dev-runtime.json');
const developmentEnvironmentPath = resolve(projectRoot, '.env');
const developmentConfigurationPath = resolve(projectRoot, '.dev-server-configuration.json');
const clientPort = 5173;

function readServerPort() {
  const configurationPath = resolve(projectRoot, 'server_configuration.json');
  const configuration = JSON.parse(readFileSync(configurationPath, 'utf8'));
  const port = configuration?.server?.port;

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Expected an integer server.port in ${configurationPath}.`);
  }

  return port;
}

function getLanAddresses() {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

async function writeAtomically(path, contents) {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, contents, 'utf8');
  await rename(temporaryPath, path);
}

async function ensureDevelopmentEnvironment() {
  if (existsSync(developmentEnvironmentPath)) {
    return false;
  }

  const environment = [
    '# Generated for local development by npm run dev. Keep this file private.',
    'NODE_ENV=development',
    `SESSION_HMAC_SECRET=${randomBytes(48).toString('base64url')}`,
    `RATE_LIMIT_HMAC_SECRET=${randomBytes(48).toString('base64url')}`,
    'COOKIE_SECURE=false',
    '',
  ].join('\n');

  try {
    await writeFile(developmentEnvironmentPath, environment, { encoding: 'utf8', flag: 'wx' });
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST') {
      return false;
    }
    throw error;
  }
}

async function prepareDevelopmentServerConfiguration() {
  const configurationPath = resolve(projectRoot, 'server_configuration.json');
  const configuration = JSON.parse(await readFile(configurationPath, 'utf8'));
  const existingOrigins = configuration?.server?.allowedOrigins;

  if (!Array.isArray(existingOrigins) || !existingOrigins.every((origin) => typeof origin === 'string')) {
    throw new Error(`Expected server.allowedOrigins to be an array of strings in ${configurationPath}.`);
  }

  const lanOrigins = getLanAddresses().map((address) => `http://${address}:${clientPort}`);
  configuration.server.allowedOrigins = [...new Set([...existingOrigins, ...lanOrigins])];
  await writeAtomically(developmentConfigurationPath, `${JSON.stringify(configuration, null, 2)}\n`);
}

function npmInvocation(argumentsAfterRun) {
  if (process.platform === 'win32') {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', `npm run ${argumentsAfterRun.join(' ')}`],
    };
  }

  return { command: 'npm', args: ['run', ...argumentsAfterRun] };
}

function startChild(label, script, environment = {}) {
  const invocation = npmInvocation([script]);
  const child = spawn(invocation.command, invocation.args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      VITE_DEV_HOST: '0.0.0.0',
      ...environment,
    },
    stdio: 'inherit',
    windowsHide: false,
  });

  child.once('error', (error) => {
    console.error(`Unable to start ${label}: ${error.message}`);
  });

  return child;
}

function portIsOpen(port) {
  return new Promise((resolvePort) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = (open) => {
      socket.destroy();
      resolvePort(open);
    };

    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function waitForPort(port, label, child, timeoutMilliseconds = 15_000) {
  const deadline = Date.now() + timeoutMilliseconds;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`${label} stopped before opening port ${port}.`);
    }

    if (await portIsOpen(port)) {
      return;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }

  throw new Error(`${label} did not open port ${port} within ${timeoutMilliseconds / 1000} seconds.`);
}

async function readRuntimeState() {
  if (!existsSync(runtimeStatePath)) {
    return undefined;
  }

  try {
    const state = JSON.parse(await readFile(runtimeStatePath, 'utf8'));
    if (!Number.isInteger(state?.launcherPid) || !Number.isInteger(state?.serverPort)) {
      throw new Error('Invalid runtime state.');
    }
    return state;
  } catch {
    await rm(runtimeStatePath, { force: true });
    return undefined;
  }
}

async function writeRuntimeState(state) {
  await writeAtomically(runtimeStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isLauncherProcess(pid) {
  if (!isProcessAlive(pid)) {
    return false;
  }

  if (process.platform === 'win32') {
    const inspection = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`,
      ],
      { encoding: 'utf8' },
    );
    return inspection.status === 0 && inspection.stdout.includes('tools/dev-runtime.mjs start');
  }

  const inspection = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  return inspection.status === 0 && inspection.stdout.includes('tools/dev-runtime.mjs start');
}

function terminateProcessTree(pid) {
  if (process.platform === 'win32') {
    const termination = spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' });
    if (termination.status !== 0) {
      throw new Error(termination.stderr.trim() || `Unable to stop process ${pid}.`);
    }
    return;
  }

  process.kill(pid, 'SIGTERM');
}

function printAddresses() {
  console.log(`\nDevelopment runtime is ready: http://localhost:${clientPort}`);
  for (const address of getLanAddresses()) {
    console.log(`Phone on the same Wi-Fi: http://${address}:${clientPort}`);
  }
  console.log('Stop it with Ctrl+C here or npm run dev:stop in another terminal.\n');
}

async function stopRuntime({ quiet = false } = {}) {
  const state = await readRuntimeState();
  if (state === undefined) {
    if (!quiet) {
      console.log('No shared development runtime is registered.');
    }
    await rm(developmentConfigurationPath, { force: true });
    return;
  }

  if (!isLauncherProcess(state.launcherPid)) {
    await rm(runtimeStatePath, { force: true });
    await rm(developmentConfigurationPath, { force: true });
    if (!quiet) {
      console.log('Removed stale development-runtime state; no process was stopped.');
    }
    return;
  }

  terminateProcessTree(state.launcherPid);
  await rm(runtimeStatePath, { force: true });
  await rm(developmentConfigurationPath, { force: true });
  if (!quiet) {
    console.log('Shared development server and client stopped.');
  }
}

async function startRuntime() {
  const previousState = await readRuntimeState();
  if (previousState !== undefined && isLauncherProcess(previousState.launcherPid)) {
    throw new Error('The shared development runtime is already running. Use npm run dev:stop first.');
  }
  if (previousState !== undefined) {
    await rm(runtimeStatePath, { force: true });
  }

  const createdEnvironment = await ensureDevelopmentEnvironment();
  if (createdEnvironment) {
    console.log('Created a private .env with random development-only session secrets.');
  }

  const serverPort = readServerPort();
  for (const port of [serverPort, clientPort]) {
    if (await portIsOpen(port)) {
      throw new Error(
        `Port ${port} is already in use. Stop the existing process or run npm run dev:stop if it is Arcanorum.`,
      );
    }
  }
  await prepareDevelopmentServerConfiguration();

  const children = [];
  let shuttingDown = false;
  const shutdown = async (exitCode) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    for (const child of children) {
      if (child.exitCode === null && child.pid !== undefined) {
        terminateProcessTree(child.pid);
      }
    }
    await rm(runtimeStatePath, { force: true });
    await rm(developmentConfigurationPath, { force: true });
    process.exit(exitCode);
  };

  process.once('SIGINT', () => void shutdown(0));
  process.once('SIGTERM', () => void shutdown(0));

  const server = startChild('server', 'dev:server', {
    SERVER_CONFIGURATION_PATH: developmentConfigurationPath,
  });
  children.push(server);
  await writeRuntimeState({
    launcherPid: process.pid,
    serverPort,
    clientPort,
    startedAt: new Date().toISOString(),
  });

  try {
    await waitForPort(serverPort, 'Server', server);
    const client = startChild('client', 'dev:client');
    children.push(client);
    await waitForPort(clientPort, 'Client', client);
  } catch (error) {
    await shutdown(1);
    throw error;
  }

  printAddresses();

  for (const [label, child] of [
    ['Server', server],
    ['Client', children[1]],
  ]) {
    child.once('exit', (code) => {
      if (!shuttingDown) {
        console.error(`${label} stopped unexpectedly (exit code ${code ?? 'unknown'}).`);
        void shutdown(1);
      }
    });
  }
}

async function showStatus() {
  const state = await readRuntimeState();
  if (state !== undefined && isLauncherProcess(state.launcherPid)) {
    console.log(
      `Shared development runtime is running (server ${state.serverPort}, client ${state.clientPort}).`,
    );
    return;
  }
  console.log('Shared development runtime is stopped.');
}

const command = process.argv[2] ?? 'start';

try {
  if (command === 'start') {
    await startRuntime();
  } else if (command === 'stop') {
    await stopRuntime();
  } else if (command === 'status') {
    await showStatus();
  } else {
    throw new Error(`Unknown command: ${command}. Use start, stop, or status.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
