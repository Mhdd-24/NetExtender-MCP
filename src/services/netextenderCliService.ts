import { spawn } from 'node:child_process';

import { NE } from '../config/netextender.config.js';
import { env } from '../env.js';
import type {
  ConnectInput,
  ConnectProfileInput,
  NxcliRunResult,
  ParsedVpnStatus,
  VpnSessionStatus,
} from '../interfaces/netextender.js';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

function quoteArg(value: string): string {
  return /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

export async function runNxcli(args: string[], timeoutMs = NE.CLI.DEFAULT_TIMEOUT_MS): Promise<NxcliRunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(env.CLI_PATH, args, {
      windowsHide: true,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`nxcli timed out after ${timeoutMs}ms: ${args.join(' ')}`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const combined = `${stdout}\n${stderr}`.trim();
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code ?? 1, combined });
    });
  });
}

function promptOtpViaDialog(): Promise<string> {
  const command = [
    'Add-Type -AssemblyName Microsoft.VisualBasic',
    '$code = [Microsoft.VisualBasic.Interaction]::InputBox(',
    "'Enter VPN OTP from your authenticator app', 'NetExtender VPN', ''",
    ')',
    'if ([string]::IsNullOrWhiteSpace($code)) { exit 2 }',
    'Write-Output $code.Trim()',
  ].join('; ');

  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-Command', command], {
      windowsHide: false,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      const otp = stdout.trim();
      if (code === 2 || !otp) {
        reject(new Error('OTP entry cancelled'));
        return;
      }
      if (code !== 0) {
        reject(new Error('Failed to read OTP from dialog'));
        return;
      }
      resolve(otp);
    });
  });
}

async function runInteractiveConnect(profileName: string, password: string, otp?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(env.CLI_PATH, ['connect', profileName], {
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let buffer = '';
    let certHandled = false;
    let passwordHandled = false;
    let otpMenuHandled = false;
    let otpHandled = false;
    let otpDialogPending = false;
    let output = '';
    let processing = false;

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`nxcli connect timed out after ${NE.CLI.CONNECT_INTERACTIVE_TIMEOUT_MS}ms`));
    }, NE.CLI.CONNECT_INTERACTIVE_TIMEOUT_MS);

    const writeLine = (value: string) => {
      child.stdin?.write(`${value}\r\n`);
    };

    const processBuffer = async () => {
      if (processing) { return; }
      processing = true;
      try {
        while (buffer.length > 0) {
          if (!certHandled && /(security certificate|Do you want to proceed\?)/i.test(buffer)) {
            certHandled = true;
            writeLine('T');
            buffer = '';
            continue;
          }

          if (!passwordHandled && /Please input password/i.test(buffer)) {
            passwordHandled = true;
            writeLine(password);
            buffer = '';
            continue;
          }

          if (!otpMenuHandled && /(Select OTP method|Input OTP code)/i.test(buffer)) {
            otpMenuHandled = true;
            writeLine('2');
            buffer = '';
            continue;
          }

          if (!otpHandled && !otpDialogPending && /(bind App|enter the code below)/i.test(buffer)) {
            otpDialogPending = true;
            try {
              const code = otp ?? await promptOtpViaDialog();
              otpHandled = true;
              writeLine(code);
              buffer = '';
            } catch (error) {
              child.kill();
              reject(error instanceof Error ? error : new Error('OTP entry failed'));
              return;
            } finally {
              otpDialogPending = false;
            }
            continue;
          }

          break;
        }
      } finally {
        processing = false;
      }
    };

    const onData = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      buffer += text;
      void processBuffer();
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 && !/connected/i.test(output)) {
        reject(new Error(`${NE.MESSAGES.CLI_FAILED_PREFIX} (exit ${code}): ${output.trim()}`));
        return;
      }
      resolve(output.trim());
    });
  });
}

async function waitForVpnConnected(): Promise<ParsedVpnStatus> {
  const deadline = Date.now() + NE.CLI.CONNECT_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = await getVpnStatus();
    if (status.connected) { return status; }
    await sleep(NE.CLI.CONNECT_POLL_INTERVAL_MS);
  }
  throw new Error(NE.MESSAGES.CONNECT_TIMEOUT);
}

function parseSession(raw: string): VpnSessionStatus {
  const read = (label: string): string | undefined => {
    const match = raw.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, 'mi'));
    return match?.[1]?.trim() || undefined;
  };

  return {
    username: read('Username'),
    server: read('Server'),
    protocol: read('Protocol'),
    ipv4Address: read('IPv4 Address'),
    connectedTime: read('Connected Time'),
    raw,
  };
}

export function parseVpnStatus(output: string): ParsedVpnStatus {
  const raw = output.trim();
  if (!raw) { return { connected: false, raw: '(no output)' }; }
  if (raw.includes(NE.CLI.CONNECTED_MARKER)) {
    return { connected: true, session: parseSession(raw), raw };
  }
  return { connected: false, raw };
}

export async function getVpnStatus(): Promise<ParsedVpnStatus> {
  const result = await runNxcli(['status'], NE.CLI.STATUS_TIMEOUT_MS);
  if (result.exitCode !== 0 && !result.combined) {
    throw new Error(`${NE.MESSAGES.CLI_FAILED_PREFIX} (exit ${result.exitCode})`);
  }
  return parseVpnStatus(result.combined);
}

export async function listVpnProfiles(profileName?: string): Promise<string> {
  const args = profileName ? ['connection', 'list', profileName] : ['connection', 'list'];
  const result = await runNxcli(args, NE.CLI.LIST_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    throw new Error(`${NE.MESSAGES.CLI_FAILED_PREFIX} (exit ${result.exitCode}): ${result.combined}`);
  }
  return result.combined;
}

async function upsertProfile(input: ConnectProfileInput): Promise<void> {
  const args = [
    'connection', 'add', input.profileName,
    '-s', input.server,
    '-d', input.domain,
    '-u', input.username,
    '-p', input.password,
    '--force',
  ];
  if (input.alwaysTrust) { args.push('--always-trust'); }

  const result = await runNxcli(args);
  if (result.exitCode !== 0 && /already exist/i.test(result.combined)) {
    await runNxcli(['connection', 'delete', input.profileName]);
    const retry = await runNxcli(args);
    if (retry.exitCode !== 0) {
      throw new Error(`${NE.MESSAGES.CLI_FAILED_PREFIX} while adding profile: ${retry.combined}`);
    }
    return;
  }
  if (result.exitCode !== 0) {
    throw new Error(`${NE.MESSAGES.CLI_FAILED_PREFIX} while adding profile: ${result.combined}`);
  }
}

export async function connectVpn(input: ConnectInput): Promise<string> {
  const current = await getVpnStatus();
  if (current.connected) { return current.raw; }

  const profileName = input.profileName?.trim() || env.PROFILE;
  const server = input.server?.trim() || env.SERVER;
  const domain = input.domain?.trim() || env.DOMAIN;
  const username = input.username?.trim() || env.USERNAME;
  const password = input.password ?? env.PASSWORD;
  const alwaysTrust = input.alwaysTrust ?? env.ALWAYS_TRUST;
  const otp = input.otp?.trim();

  if (!profileName && !server) { throw new Error(NE.MESSAGES.MISSING_PROFILE); }
  if (server) {
    if (!domain) { throw new Error(NE.MESSAGES.MISSING_DOMAIN); }
    if (!username) { throw new Error(NE.MESSAGES.MISSING_USERNAME); }
    if (!password) { throw new Error(NE.MESSAGES.MISSING_PASSWORD); }
    await upsertProfile({
      profileName: profileName || server,
      server,
      domain,
      username,
      password,
      alwaysTrust,
    });
  }

  const resolvedProfile = profileName || server;
  if (!resolvedProfile) { throw new Error(NE.MESSAGES.MISSING_PROFILE); }
  if (!password) { throw new Error(NE.MESSAGES.MISSING_PASSWORD); }

  await runInteractiveConnect(resolvedProfile, password, otp);
  const status = await waitForVpnConnected();
  return status.raw;
}

export async function disconnectVpn(): Promise<string> {
  const current = await getVpnStatus();
  if (!current.connected) { return current.raw; }

  const result = await runNxcli(['disconnect'], NE.CLI.STATUS_TIMEOUT_MS);
  if (result.exitCode !== 0) {
    throw new Error(`${NE.MESSAGES.CLI_FAILED_PREFIX} (exit ${result.exitCode}): ${result.combined}`);
  }
  return result.combined || 'Disconnected';
}

export function formatStatusText(status: ParsedVpnStatus): string {
  if (!status.connected) {
    return `VPN status: disconnected\n\n${status.raw}`;
  }
  const session = status.session;
  return [
    'VPN status: connected',
    session.username ? `- Username: ${session.username}` : undefined,
    session.server ? `- Server: ${session.server}` : undefined,
    session.ipv4Address ? `- IPv4: ${session.ipv4Address}` : undefined,
    session.connectedTime ? `- Connected time: ${session.connectedTime}` : undefined,
    '',
    status.raw,
  ].filter((line): line is string => line != null).join('\n');
}

export function maskSecrets(text: string, secrets: string[]): string {
  let masked = text;
  for (const secret of secrets) {
    if (!secret) { continue; }
    masked = masked.split(secret).join('***');
  }
  return masked;
}

export function debugCommand(args: string[]): string {
  return `${quoteArg(env.CLI_PATH)} ${args.map(quoteArg).join(' ')}`;
}
