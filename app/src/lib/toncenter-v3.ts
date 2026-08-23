import { Address } from '@ton/core';
import { toncenterApiKey, toncenterBaseUrl } from './ton';
import type { Network } from './router';

// A thin typed wrapper around the toncenter v3 REST API
// (https://toncenter.com/api/v3/doc.json). Only the endpoints the app needs are
// implemented; add more methods here as the surface grows. All v3 endpoints
// share the same base URL and API-key auth (sent either as `X-Api-Key` header
// or `api_key` query param); we use the header form, matching getTonClient.

const V3_BASE = '/api/v3';

// `/api/v3/messages` item — see toncenter v3 doc.json `Message`. Only fields
// the round-info panel reads are typed; the response may carry more.
export interface V3Message {
  source: string;
  destination: string;
  opcode: number;
  decoded_opcode?: string;
  value: string;
  created_at: string;
  created_lt: string;
  hash: string;
  hash_norm?: string;
  in_msg_tx_hash?: string;
  out_msg_tx_hash?: string;
  bounce?: boolean;
  bounced?: boolean;
  message_content?: {
    body: string; // base64-encoded BOC of the body cell
    hash: string;
    decoded?: Record<string, unknown>;
  };
  init_state?: { body: string; hash: string; decoded?: unknown };
}

interface V3MessagesResponse {
  messages: V3Message[];
  address_book?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

interface V3ErrorResponse {
  code: number;
  error: string;
}

export interface GetMessagesParams {
  source?: string;
  destination?: string;
  opcode?: string; // hex (0x..) or signed 32-bit decimal, per spec
  msg_hash?: string | string[];
  body_hash?: string;
  start_utime?: number;
  end_utime?: number;
  // LTs exceed Number.MAX_SAFE_INTEGER, so pass the string form (as returned
  // in V3Message.created_lt) for exact filtering.
  start_lt?: number | string;
  end_lt?: number | string;
  direction?: 'in' | 'out';
  exclude_externals?: boolean;
  only_externals?: boolean;
  limit?: number; // 1..1000, default 10
  offset?: number;
  sort?: 'asc' | 'desc'; // default desc
}

export class ToncenterV3Client {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;

  constructor(network: Network) {
    this.baseUrl = `${toncenterBaseUrl(network)}${V3_BASE}`;
    this.apiKey = toncenterApiKey(network);
  }

  private async get<T>(
    path: string,
    params: Record<string, unknown>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, String(item));
      } else {
        url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers['X-Api-Key'] = this.apiKey;
    const res = await fetch(url.toString(), { headers });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `toncenter v3 ${path}: invalid JSON (HTTP ${res.status})`,
      );
    }
    if (!res.ok) {
      const err = json as V3ErrorResponse;
      throw new Error(
        `toncenter v3 ${path} HTTP ${res.status}: ${err?.error ?? text}`,
      );
    }
    return json as T;
  }

  // GET /api/v3/messages — primary index for opcode-filtered message queries.
  // See https://toncenter.com/api/v3/doc.json#operation/api_v3_get_messages.
  async getMessages(params: GetMessagesParams): Promise<V3Message[]> {
    const body = await this.get<V3MessagesResponse>(
      '/messages',
      params as Record<string, unknown>,
    );
    return body.messages ?? [];
  }

  // Convenience: page through `/api/v3/messages` until `maxRows` is reached or
  // a page returns fewer than `limit`. Results are appended in request order,
  // so callers should pass a consistent `sort` (default `asc`).
  async getMessagesAll(
    params: GetMessagesParams,
    maxRows = 1000,
  ): Promise<V3Message[]> {
    const limit = Math.min(params.limit ?? 1000, 1000);
    const sort = params.sort ?? 'asc';
    let offset = params.offset ?? 0;
    const out: V3Message[] = [];
    while (out.length < maxRows) {
      const page = await this.getMessages({ ...params, limit, offset, sort });
      out.push(...page);
      if (page.length < limit) break;
      offset += limit;
    }
    return out.slice(0, maxRows);
  }
}

// Per-network singleton cache, mirroring getTonClient in ton.ts.
const v3ClientCache = new Map<Network, ToncenterV3Client>();

export function getToncenterV3(network: Network): ToncenterV3Client {
  const existing = v3ClientCache.get(network);
  if (existing) return existing;
  const client = new ToncenterV3Client(network);
  v3ClientCache.set(network, client);
  return client;
}

// toncenter v3 `source`/`destination` accept "hex, base64 or base64url form".
// The raw `workchain:hashhex` form is the most stable across toncenter builds.
export function toRawAddress(addr: string): string {
  return Address.parse(addr).toRawString();
}
