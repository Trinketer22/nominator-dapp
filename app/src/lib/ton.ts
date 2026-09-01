import { Address, Cell } from '@ton/core';
import { TonClient } from '@ton/ton';
import { QueryClient } from '@tanstack/react-query';
import { CHAIN } from '@tonconnect/ui-react';

import type { Network } from './router';

export function toncenterApiKey(network: Network): string | undefined {
  return network === 'testnet'
    ? import.meta.env.TONCENTER_TESTNET_API_KEY
    : import.meta.env.TONCENTER_MAINNET_API_KEY;
}

export function toncenterBaseUrl(network: Network): string {
  return network === 'testnet'
    ? 'https://testnet.toncenter.com'
    : 'https://toncenter.com';
}

export function toncenterRpcUrl(network: Network): string {
  return `${toncenterBaseUrl(network)}/api/v2/jsonRPC`;
}

export function tonviewerUrl(network: Network): string {
  return network === 'testnet'
    ? 'https://testnet.tonviewer.com'
    : 'https://tonviewer.com';
}

export function tonscanUrl(network: Network): string {
  return network === 'testnet'
    ? 'https://testnet.tonscan.org'
    : 'https://tonscan.org';
}

// Link to a specific transaction on tonscan.org. `hash` may be a hex string
// (with or without 0x), a base64/base64url string, or a Buffer/Uint8Array.
export function tonscanTxUrl(
  network: Network,
  hash: string | Uint8Array,
): string {
  let hex: string;
  if (typeof hash === 'string') {
    if (/^(0x)?[0-9a-fA-F]+$/.test(hash)) {
      hex = hash.replace(/^0x/, '');
    } else {
      // base64/base64url → hex
      const b64 = hash.replace(/-/g, '+').replace(/_/g, '/');
      const buf = Buffer.from(b64, 'base64');
      hex = buf.toString('hex');
    }
  } else {
    hex = Buffer.from(hash).toString('hex');
  }
  return `${tonscanUrl(network)}/tx/${hex}`;
}

// Link to an account on tonscan.org. `addr` may be raw or user-friendly.
export function tonscanAddrUrl(network: Network, addr: string): string {
  const friendly = formatAddressForNetwork(addr, network);
  return `${tonscanUrl(network)}/${friendly}`;
}

export function networkLabel(network: Network): string {
  return network === 'testnet' ? 'testnet' : 'mainnet';
}

export function networkChain(network: Network): CHAIN {
  return network === 'testnet' ? CHAIN.TESTNET : CHAIN.MAINNET;
}

export function formatAddressForNetwork(
  address: string,
  network: Network,
  bounceable = false,
): string {
  return Address.parse(address).toString({
    bounceable,
    testOnly: network === 'testnet',
  });
}

// True if `address` can be parsed as a TON address (raw or user-friendly,
// any workchain, bounceable or not). Returns false instead of throwing so
// input fields can validate without try/catch noise.
export function isValidAddress(address: string): boolean {
  if (!address) return false;
  try {
    Address.parse(address);
    return true;
  } catch {
    return false;
  }
}

// Detects whether a user-friendly address carries the testnet flag. Raw
// addresses (`workchain:hash`) carry no testnet bit, so this returns null for
// them — their network must be determined another way (e.g. the connected
// wallet's chain). Also returns null for unparseable input.
export function detectAddressNetwork(address: string): Network | null {
  try {
    if (!Address.isFriendly(address)) return null;
    return Address.parseFriendly(address).isTestOnly ? 'testnet' : 'mainnet';
  } catch {
    return null;
  }
}

const clientCache = new Map<Network, TonClientWithConfig>();

export function getTonClient(network: Network): TonClientWithConfig {
  const existing = clientCache.get(network);
  if (existing) return existing;
  const client = new TonClientWithConfig({
    endpoint: toncenterRpcUrl(network),
    apiKey: toncenterApiKey(network),
  });
  clientCache.set(network, client);
  return client;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

// TonClient subclass that adds network config fetching via the toncenter v2
// JSON-RPC `getConfigParam` method. Reuses the same endpoint and API key as
// the parent client, so all configuration (network, rate-limit key) is shared.
class TonClientWithConfig extends TonClient {
  async getConfigParam(seqno: number, param: number): Promise<Cell | null> {
    // `api` is the internal HttpApi instance. It's not in the public type
    // definitions but is a public field on the TonClient class instance.
    // We reuse its `doCall` to get the same endpoint/headers/timeout handling.
    const api = this as unknown as {
      api: {
        endpoint: string;
        parameters: { apiKey?: string; timeout?: number };
      };
    };
    const endpoint = api.api.endpoint;
    const apiKey = api.api.parameters.apiKey;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Ton-Client-Version': '0.58.0',
    };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: '1',
        jsonrpc: '2.0',
        method: 'getConfigParam',
        params: { seqno, param },
      }),
    });
    const json = await res.json();
    if (!json.ok || !json.result?.config?.bytes) return null;
    return Cell.fromBase64(json.result.config.bytes);
  }
}

// Staking limits from config param 17 (see contracts/config.tolk StakingLimits).
export interface StakingLimits {
  minStake: bigint; // nano
  maxStake: bigint; // nano
  minTotal: bigint; // nano
  maxFactor: bigint;
}

export async function getNetworkStakingLimits(
  network: Network,
): Promise<StakingLimits | null> {
  const client = getTonClient(network);
  const { latestSeqno } = await client.getMasterchainInfo();
  const cell = await client.getConfigParam(latestSeqno, 17);
  if (!cell) return null;
  const s = cell.beginParse();
  const minStake = s.loadCoins();
  const maxStake = s.loadCoins();
  const minTotal = s.loadCoins();
  const maxFactor = s.loadUintBig(32);
  return { minStake, maxStake, minTotal, maxFactor };
}
