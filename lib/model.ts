import { farmSteps } from './farm.ts';

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export const MODEL = {
  min_category_peers: 5,
  growth_weight: 0.5,
  growth_floor: 0.7,
  growth_cap: 1.4,
  new_age_days: 180,
  old_age_days: 1095,
  new_multiplier: 1.05,
  old_multiplier: 0.95,
  breadth_per_extra_chain: 0.02,
  breadth_bonus_cap: 0.08,
};

export type ModelConstants = typeof MODEL;

export const MODEL_VERSION = 'radar-2';
export const EARLY_ROWS = 160;
export const LIVE_ROWS = 24;

interface PeerStats {
  count: number;
  median: number | null;
}

interface PeerContext {
  global: { count: number; median: number };
  categories: Map<string | null, PeerStats>;
}

type PeerSource = 'category_median' | 'shrunk_category_median' | 'global_median';

interface ModelBreakdown {
  category: string | null;
  peer_count: number;
  category_median_multiple: number | null;
  global_median_multiple: number;
  category_weight: number;
  peer_source: PeerSource;
  peer_multiple: number;
  growth_pct: number | null;
  growth_multiplier: number;
  age_days: number | null;
  maturity_multiplier: number;
  chain_count: number;
  breadth_multiplier: number;
}

export interface BoardRow extends SnapshotProtocol {
  rank: number;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

export type LiveRow = Pick<SnapshotProtocol, 'slug' | 'name' | 'category' | 'chains' | 'tvl_usd' | 'mcap_usd' | 'change_7d'>;

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_peers: PeerContext['global'];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: BoardRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

function peerStats(multiples: number[]): PeerStats {
  const count = multiples.length;
  if (count === 0) return { count, median: null };
  multiples.sort((a, b) => a - b);
  const lower = multiples[Math.floor((count - 1) / 2)]!;
  const upper = multiples[Math.floor(count / 2)]!;
  return { count, median: (lower + upper) / 2 };
}

/** Use every snapshot protocol with both measurements, including those outside the ranked board. */
function collectPeers(protocols: SnapshotProtocol[]): PeerContext {
  const multiples: number[] = [];
  const byCategory = new Map<string | null, number[]>();
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const multiple = p.mcap_usd / p.tvl_usd;
    multiples.push(multiple);
    const category = byCategory.get(p.category) ?? [];
    category.push(multiple);
    byCategory.set(p.category, category);
  }

  const { count, median } = peerStats(multiples);
  if (median === null) throw new SnapshotError('snapshot.json has no market-cap/TVL peers for valuation');
  const categories = new Map([...byCategory].map(([category, values]) => [category, peerStats(values)]));
  return { global: { count, median }, categories };
}

function peerMultiple(category: string | null, peers: PeerContext, minPeers: number) {
  const group = peers.categories.get(category);
  const count = group?.count ?? 0;
  const median = group?.median ?? null;
  const global = peers.global.median;
  const weight = Math.min(1, count / minPeers);
  let source: PeerSource = 'global_median';
  let multiple = global;

  if (median !== null && weight === 1) {
    source = 'category_median';
    multiple = median;
  } else if (median !== null) {
    source = 'shrunk_category_median';
    // Interpolate on log(1 + multiple) so extreme small-group medians have less leverage.
    // The offset lets zero market caps participate without a special case.
    multiple = Math.expm1(weight * Math.log1p(median) + (1 - weight) * Math.log1p(global));
  }

  return {
    category,
    peer_count: count,
    category_median_multiple: median,
    global_median_multiple: global,
    category_weight: weight,
    peer_source: source,
    peer_multiple: multiple,
  };
}

function valuation(p: SnapshotProtocol, asOf: string, peers: PeerContext, model: ModelConstants) {
  const peer = peerMultiple(p.category, peers, model.min_category_peers);
  const growth = Math.min(model.growth_cap, Math.max(model.growth_floor, 1 + model.growth_weight * (p.change_7d ?? 0) / 100));
  const age = ageDays(asOf, p.listed_at);
  let maturity = 1;
  if (age !== null && age < model.new_age_days) maturity = model.new_multiplier;
  if (age !== null && age >= model.old_age_days) maturity = model.old_multiplier;
  const chainCount = new Set(p.chains).size;
  const breadth = 1 + Math.min(model.breadth_bonus_cap, Math.max(0, chainCount - 1) * model.breadth_per_extra_chain);
  const implied = Math.max(1, Math.round(p.tvl_usd * peer.peer_multiple * growth * maturity * breadth));
  return {
    implied,
    breakdown: {
      ...peer,
      growth_pct: p.change_7d,
      growth_multiplier: growth,
      age_days: age,
      maturity_multiplier: maturity,
      chain_count: chainCount,
      breadth_multiplier: breadth,
    },
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** Rank the watchlist plus the largest eligible protocols below its floor. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  return rankBoard(snapshot, model, collectPeers(snapshot.protocols));
}

function rankBoard(snapshot: Snapshot, model: ModelConstants, peers: PeerContext): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }

  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || compareSlug(a, b))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...valuation(p, snapshot.as_of, peers, model) }));
  scored.sort((a, b) => b.implied - a.implied || compareSlug(a.p, b.p));
  return scored.map(({ p, implied, breakdown }, index) => ({
    ...p,
    rank: index + 1,
    token_status: 'pre-token',
    age_days: breakdown.age_days,
    implied_value_usd: implied,
    model: breakdown,
    farm_steps: farmSteps(p),
  }));
}

function compareSlug(a: SnapshotProtocol, b: SnapshotProtocol): number {
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** Everything the dashboard renders, with the same rows as board.json. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const peers = collectPeers(snapshot.protocols);
  const board = rankBoard(snapshot, model, peers);
  const live = liveRows(snapshot);
  const watchlist = new Set(snapshot.watchlist);
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_peers: peers.global,
    watchlist_size: watchlist.size,
    board_size: board.length,
    early_size: board.filter((r) => !watchlist.has(r.slug)).length,
    live_size: live.length,
    rows: board,
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
