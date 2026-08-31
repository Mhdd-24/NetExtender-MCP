import dotenv from 'dotenv';
import { existsSync } from 'node:fs';

import { NE } from './config/netextender.config.js';

dotenv.config();

function readEnv(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value?.trim()) { return value.trim(); }
  }
  return undefined;
}

function readBool(keys: readonly string[], fallback = false): boolean {
  const raw = readEnv(keys);
  if (raw == null) { return fallback; }
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function resolveCliPath(): string {
  const configured = readEnv(NE.ENV.CLI_KEYS);
  if (configured && existsSync(configured)) { return configured; }
  for (const candidate of NE.CLI.DEFAULT_WINDOWS_PATHS) {
    if (existsSync(candidate)) { return candidate; }
  }
  return configured ?? NE.CLI.DEFAULT_WINDOWS_PATHS[0];
}

export const env = {
  CLI_PATH: resolveCliPath(),
  PROFILE: readEnv(NE.ENV.PROFILE_KEYS) ?? '',
  SERVER: readEnv(NE.ENV.SERVER_KEYS) ?? '',
  DOMAIN: readEnv(NE.ENV.DOMAIN_KEYS) ?? '',
  USERNAME: readEnv(NE.ENV.USERNAME_KEYS) ?? '',
  PASSWORD: readEnv(NE.ENV.PASSWORD_KEYS) ?? '',
  ALWAYS_TRUST: readBool(NE.ENV.ALWAYS_TRUST_KEYS, false),
};

export function validateEnv(): void {
  if (!existsSync(env.CLI_PATH)) {
    throw new Error(`${NE.MESSAGES.MISSING_CLI} Tried: ${env.CLI_PATH}`);
  }
}
