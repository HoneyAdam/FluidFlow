const { spawnSync } = require('node:child_process');

const PRETTIER_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.cjs',
  '.mjs',
  '.json',
  '.md',
  '.css',
  '.scss',
  '.html',
  '.yml',
  '.yaml',
]);

function getChangedFiles() {
  const status = spawnSync('git', ['status', '--porcelain'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    shell: process.platform === 'win32',
  });

  if (status.status !== 0) {
    process.exit(status.status ?? 1);
  }

  return status.stdout
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => line.slice(3))
    .map(pathPart => {
      if (pathPart.includes(' -> ')) {
        return pathPart.split(' -> ').pop();
      }
      return pathPart;
    })
    .filter(Boolean);
}

function isPrettierFile(filePath) {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) return false;
  const extension = filePath.slice(dotIndex).toLowerCase();
  return PRETTIER_EXTENSIONS.has(extension);
}

const changedFiles = getChangedFiles().filter(isPrettierFile);

if (changedFiles.length === 0) {
  console.log('[format:check] No changed files to check.');
  process.exit(0);
}

const prettier = spawnSync('npx', ['prettier', '--check', ...changedFiles], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(prettier.status ?? 1);
