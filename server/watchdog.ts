/**
 * Server Watchdog
 *
 * Monitors the backend server health and restarts it if it crashes or becomes unresponsive.
 * Usage: npx tsx server/watchdog.ts
 */

import { spawn, ChildProcess } from 'child_process';
import http from 'http';

const SERVER_PORT = process.env.SERVER_PORT || 3101;
const HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_DELAY = 2000; // 2 seconds

let serverProcess: ChildProcess | null = null;
let restartCount = 0;
let lastRestartTime = 0;
let isShuttingDown = false;

function log(message: string) {
  console.log(`[Watchdog ${new Date().toISOString()}] ${message}`);
}

function checkHealth(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${SERVER_PORT}/api/health`, {
      timeout: HEALTH_CHECK_TIMEOUT
    }, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function startServer(): ChildProcess {
  log('Starting server...');

  const proc = spawn('npx', ['tsx', 'server/index.ts'], {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd()
  });

  proc.on('exit', (code, signal) => {
    if (isShuttingDown) {
      log('Server stopped (graceful shutdown)');
      return;
    }

    log(`Server exited with code ${code}, signal ${signal}`);
    serverProcess = null;

    // Reset restart count if server was running for more than 5 minutes
    const now = Date.now();
    if (now - lastRestartTime > 5 * 60 * 1000) {
      restartCount = 0;
    }

    if (restartCount < MAX_RESTART_ATTEMPTS) {
      restartCount++;
      lastRestartTime = now;
      log(`Restarting server (attempt ${restartCount}/${MAX_RESTART_ATTEMPTS})...`);
      setTimeout(() => {
        serverProcess = startServer();
      }, RESTART_DELAY);
    } else {
      log(`Max restart attempts (${MAX_RESTART_ATTEMPTS}) reached. Manual intervention required.`);
      process.exit(1);
    }
  });

  return proc;
}

async function monitorHealth() {
  if (isShuttingDown || !serverProcess) return;

  const isHealthy = await checkHealth();

  if (!isHealthy && serverProcess && !serverProcess.killed) {
    log('Server unresponsive, killing and restarting...');
    serverProcess.kill('SIGKILL');
  }
}

function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  log(`Received ${signal}, shutting down...`);

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
  }

  setTimeout(() => {
    process.exit(0);
  }, 3000);
}

// Start the watchdog
log('Watchdog starting...');
serverProcess = startServer();

// Health check interval
setInterval(monitorHealth, HEALTH_CHECK_INTERVAL);

// Graceful shutdown
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

log('Watchdog active');
