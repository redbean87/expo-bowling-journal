import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function collectTests(directory, result = []) {
  const entries = readdirSync(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      collectTests(fullPath, result);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      result.push(fullPath);
    }
  }

  return result;
}

function main() {
  const target = process.argv[2] ?? 'tests';
  const targetDir = resolve(process.cwd(), target);
  const testFiles = collectTests(targetDir).sort((left, right) =>
    left.localeCompare(right)
  );

  if (testFiles.length === 0) {
    console.error(`No test files found in ${targetDir}`);
    process.exit(1);
  }

  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--test', ...testFiles],
    {
      stdio: 'inherit',
      shell: false,
    }
  );

  process.exit(result.status ?? 1);
}

main();
