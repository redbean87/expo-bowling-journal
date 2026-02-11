import { spawnSync } from 'node:child_process';

function run(command, args) {
  return spawnSync(command, args, {
    stdio: 'inherit',
  });
}

function main() {
  if (process.platform === 'win32') {
    const result = run('powershell.exe', [
      '-NoProfile',
      '-Command',
      '$processes = Get-Process workerd -ErrorAction SilentlyContinue; if ($processes) { $processes | Stop-Process -Force }; exit 0',
    ]);

    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }

    console.log('Stopped any running workerd processes (if present).');
    return;
  }

  const result = run('pkill', ['-f', 'workerd']);

  if (result.status === 0 || result.status === 1) {
    console.log('Stopped any running workerd processes (if present).');
    return;
  }

  process.exit(result.status ?? 1);
}

main();
