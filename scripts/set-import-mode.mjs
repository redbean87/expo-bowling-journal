import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const LOCAL_WORKER_URL = 'http://127.0.0.1:8787';
const LOCAL_QUEUE_PATH = '/imports/process';
const CLOUD_QUEUE_PATH = '/imports/queue';

function parseArgs(argv) {
  const args = {
    mode: null,
    cloudUrl: null,
    dryRun: false,
  };

  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];

    if (!value.startsWith('--') && !args.mode) {
      args.mode = value;
      continue;
    }

    if (value === '--dry-run') {
      args.dryRun = true;
      continue;
    }

    if (value.startsWith('--cloud-url=')) {
      args.cloudUrl = value.slice('--cloud-url='.length);
      continue;
    }

    if (value === '--cloud-url') {
      const next = argv[index + 1];

      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --cloud-url');
      }

      args.cloudUrl = next;
      index += 1;
    }
  }

  return args;
}

function getModeConfig(mode, envMap, cloudUrlArg) {
  if (mode === 'local') {
    return {
      workerUrl: LOCAL_WORKER_URL,
      queuePath: LOCAL_QUEUE_PATH,
      persistCloudUrl: null,
    };
  }

  if (mode === 'cloud') {
    const cloudUrl =
      cloudUrlArg ||
      envMap.get('EXPO_PUBLIC_IMPORT_WORKER_URL_CLOUD') ||
      (envMap
        .get('EXPO_PUBLIC_IMPORT_WORKER_URL')
        ?.startsWith('http://127.0.0.1')
        ? null
        : envMap.get('EXPO_PUBLIC_IMPORT_WORKER_URL'));

    if (!cloudUrl) {
      throw new Error(
        'Cloud worker URL not found. Set EXPO_PUBLIC_IMPORT_WORKER_URL_CLOUD in .env.local or pass --cloud-url.'
      );
    }

    return {
      workerUrl: cloudUrl,
      queuePath: CLOUD_QUEUE_PATH,
      persistCloudUrl: cloudUrl,
    };
  }

  throw new Error("Invalid mode. Use 'local' or 'cloud'.");
}

function parseEnvValue(rawLineValue) {
  const trimmed = rawLineValue.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadEnvFile(filePath) {
  let text = '';

  try {
    text = readFileSync(filePath, 'utf8');
  } catch {
    text = '';
  }

  const lines = text.length > 0 ? text.split(/\r?\n/) : [];
  const envMap = new Map();

  for (const line of lines) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

    if (!match) {
      continue;
    }

    envMap.set(match[1], parseEnvValue(match[2]));
  }

  return { text, envMap };
}

function escapeEnvValue(value) {
  if (/^[A-Za-z0-9:/._-]+$/.test(value)) {
    return value;
  }

  return JSON.stringify(value);
}

function upsertEnvLine(text, key, value) {
  const lineValue = `${key}=${escapeEnvValue(value)}`;
  const linePattern = new RegExp(`^\\s*${key}\\s*=.*$`, 'm');

  if (linePattern.test(text)) {
    return text.replace(linePattern, lineValue);
  }

  const separator = text.length === 0 || text.endsWith('\n') ? '' : '\n';
  return `${text}${separator}${lineValue}\n`;
}

function runConvexEnvSet(name, value) {
  const result = spawnSync('npx', ['convex', 'env', 'set', name, value], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    throw new Error(`Failed to set Convex env ${name}`);
  }
}

function main() {
  const { mode, cloudUrl, dryRun } = parseArgs(process.argv);

  if (!mode) {
    throw new Error("Missing mode argument. Use 'local' or 'cloud'.");
  }

  const envPath = resolve(process.cwd(), '.env.local');
  const { text: envText, envMap } = loadEnvFile(envPath);
  const config = getModeConfig(mode, envMap, cloudUrl);

  let nextText = envText;
  nextText = upsertEnvLine(
    nextText,
    'EXPO_PUBLIC_IMPORT_WORKER_URL',
    config.workerUrl
  );

  if (config.persistCloudUrl) {
    nextText = upsertEnvLine(
      nextText,
      'EXPO_PUBLIC_IMPORT_WORKER_URL_CLOUD',
      config.persistCloudUrl
    );
  }

  if (!dryRun) {
    writeFileSync(envPath, nextText, 'utf8');
    runConvexEnvSet('IMPORT_WORKER_URL', config.workerUrl);
    runConvexEnvSet('IMPORT_WORKER_QUEUE_PATH', config.queuePath);
  }

  console.log(`Import mode set to ${mode}.`);
  console.log(`App worker URL: ${config.workerUrl}`);
  console.log(`Convex IMPORT_WORKER_URL: ${config.workerUrl}`);
  console.log(`Convex IMPORT_WORKER_QUEUE_PATH: ${config.queuePath}`);

  if (dryRun) {
    console.log('Dry run only; no files or Convex env were changed.');
  }
}

main();
