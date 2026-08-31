export interface VpnSessionStatus {
  username?: string;
  server?: string;
  protocol?: string;
  ipv4Address?: string;
  connectedTime?: string;
  raw: string;
}

export interface NxcliRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  combined: string;
}

export interface ConnectProfileInput {
  profileName: string;
  server: string;
  domain: string;
  username: string;
  password: string;
  alwaysTrust: boolean;
}

export interface ConnectInput {
  profileName?: string;
  server?: string;
  domain?: string;
  username?: string;
  password?: string;
  alwaysTrust?: boolean;
  otp?: string;
}

export type ParsedVpnStatus =
  | { connected: false; raw: string }
  | { connected: true; session: VpnSessionStatus; raw: string };
