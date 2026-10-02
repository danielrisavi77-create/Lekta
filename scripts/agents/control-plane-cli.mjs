#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildLeaseClaim, requestControlPlane } from './control-plane-client.mjs';

const MACHINES = new Set(['laptop', 'desktop', 'claude_cloud']);
const ROLES = new Set(['coordinator', 'implementer', 'reviewer', 'integration', 'explorer', 'flex']);

function fail(message) {
  throw new Error(message);
}

function parseOptions(args, spec) {
  const values = new Map();
  while (args.length) {
    const key = args.shift();
    if (!Object.hasOwn(spec, key) || values.has(key)) fail(`Nevaljana ili ponovljena opcija: ${key}`);
    const rule = spec[key];
    if (rule === 'flag') {
      values.set(key, true);
      continue;
    }
    const value = args.shift();
    if (!value || value.startsWith('--')) fail(`Nedostaje vrijednost za ${key}`);
    values.set(key, value);
  }
  return values;
}

function required(options, name) {
  const value = options.get(name);
  if (!value) fail(`Nedostaje ${name}`);
  return value;
}

function integerOption(options, name, fallback) {
  if (!options.has(name)) return fallback;
  const value = Number(options.get(name));
  if (!Number.isInteger(value)) fail(`${name} mora biti cijeli broj`);
  return value;
}

function readQueue(root) {
  const path = join(root, 'docs', 'agents', 'tasks.json');
  const queue = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(queue?.tasks)) fail('docs/agents/tasks.json nema tasks niz');
  return queue;
}

function taskById(queue, id) {
  const task = queue.tasks.find((item) => item.id === id);
  if (!task) fail(`Nepoznat zadatak: ${id}`);
  return task;
}

async function main(argv = process.argv.slice(2)) {
  const root = resolve(process.cwd());
  const command = argv.shift();
  if (!command || command === 'help') {
    process.stdout.write([
      'agents:lease health',
      'agents:lease register --session lekta-01 --machine laptop|desktop|claude_cloud --role coordinator|implementer|reviewer|integration|explorer|flex [--environment-kind KIND]',
      'agents:lease claim T01 --session lekta-01 --base-sha <40-sha> [--ttl-seconds 900] [--branch NAME] [--environment-kind KIND]',
      'agents:lease renew --lease-id UUID [--ttl-seconds 900]',
      'agents:lease expand T01 --lease-id UUID --session lekta-01 --base-sha <40-sha> [--ttl-seconds 900] [--branch NAME] [--environment-kind KIND]',
      'agents:lease release --lease-id UUID [--reason TEXT]',
      'agents:lease snapshot [--session lekta-01]',
      '',
    ].join('\n'));
    return;
  }

  let response;
  if (command === 'health') {
    if (argv.length) fail('health ne prima opcije');
    response = await requestControlPlane('health');
  } else if (command === 'register') {
    const options = parseOptions(argv, {
      '--session': 'value',
      '--machine': 'value',
      '--role': 'value',
      '--environment-kind': 'value',
    });
    const sessionName = required(options, '--session');
    const machine = required(options, '--machine');
    const role = required(options, '--role');
    if (!MACHINES.has(machine)) fail(`Nepoznat --machine: ${machine}`);
    if (!ROLES.has(role)) fail(`Nepoznat --role: ${role}`);
    response = await requestControlPlane('register', {
      sessionName,
      machine,
      role,
      environmentKind: options.get('--environment-kind') ?? null,
    });
  } else if (command === 'claim' || command === 'expand') {
    const taskId = argv.shift();
    if (!taskId || taskId.startsWith('--')) fail(`${command} zahtijeva Txx`);
    const options = parseOptions(argv, {
      '--session': 'value',
      '--base-sha': 'value',
      '--ttl-seconds': 'value',
      '--branch': 'value',
      '--environment-kind': 'value',
      '--lease-id': 'value',
    });
    const queue = readQueue(root);
    const task = taskById(queue, taskId);
    const claim = buildLeaseClaim({
      task,
      sessionName: required(options, '--session'),
      baseSha: required(options, '--base-sha'),
      ttlSeconds: integerOption(options, '--ttl-seconds', 900),
      branch: options.get('--branch') ?? null,
      environmentKind: options.get('--environment-kind') ?? null,
    });
    if (command === 'expand') {
      response = await requestControlPlane('expand', {
        leaseId: required(options, '--lease-id'),
        ...claim,
      });
    } else {
      if (options.has('--lease-id')) fail('claim ne prima --lease-id');
      response = await requestControlPlane('claim', claim);
    }
  } else if (command === 'renew') {
    const options = parseOptions(argv, {
      '--lease-id': 'value',
      '--ttl-seconds': 'value',
    });
    response = await requestControlPlane('renew', {
      leaseId: required(options, '--lease-id'),
      ttlSeconds: integerOption(options, '--ttl-seconds', 900),
    });
  } else if (command === 'release') {
    const options = parseOptions(argv, {
      '--lease-id': 'value',
      '--reason': 'value',
    });
    response = await requestControlPlane('release', {
      leaseId: required(options, '--lease-id'),
      reason: options.get('--reason') ?? null,
    });
  } else if (command === 'snapshot') {
    const options = parseOptions(argv, { '--session': 'value' });
    response = await requestControlPlane('snapshot', {
      sessionName: options.get('--session') ?? null,
    });
  } else {
    fail(`Nepoznata agents:lease naredba: ${command}`);
  }

  process.stdout.write(JSON.stringify(response, null, 2) + '\n');
}

try {
  await main();
} catch (error) {
  process.stderr.write(`[agents:lease] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
