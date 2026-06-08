import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'cx_session_token';

function apiBase(): string {
  if (Platform.OS === 'web') return '/api';
  const dom = process.env.EXPO_PUBLIC_DOMAIN;
  return dom ? `https://${dom}/api` : 'http://localhost:8080/api';
}

async function authHeaders(): Promise<Record<string, string>> {
  if (Platform.OS === 'web') return {};
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  return token ? { Cookie: `cx_session=${token}` } : {};
}

async function rememberToken(headers: Headers) {
  if (Platform.OS === 'web') return;
  const setCookie = headers.get('set-cookie') || headers.get('Set-Cookie');
  if (!setCookie) return;
  const m = /cx_session=([^;]+)/.exec(setCookie);
  if (m) await AsyncStorage.setItem(TOKEN_KEY, m[1]);
}

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...(await authHeaders()) };
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    credentials: Platform.OS === 'web' ? 'include' : 'omit',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  await rememberToken(res.headers);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error || `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  get:    <T>(p: string) => request<T>('GET', p),
  post:   <T>(p: string, b?: unknown) => request<T>('POST', p, b),
  patch:  <T>(p: string, b?: unknown) => request<T>('PATCH', p, b),
  delete: <T>(p: string) => request<T>('DELETE', p),
  clearToken: () => AsyncStorage.removeItem(TOKEN_KEY),
};

export type ApiUser = {
  id: number;
  uid: string;
  email: string;
  phone: string | null;
  name: string;
  role: string;
  kycLevel: number;
  kycStatus?: string;
  vipTier: number;
  referralCode: string;
  status: string;
};

export type ApiWallet = {
  id: number;
  walletType: 'spot' | 'inr' | 'earn' | 'futures' | string;
  coinId: number;
  balance: string;
  locked: string;
  coinSymbol: string;
  coinName: string;
  coinPrice: string;
};

export type ApiBank = {
  id: number;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  holderName: string;
  status: 'under_review' | 'verified' | 'rejected' | string;
  rejectReason: string | null;
  createdAt: string;
};

export type ApiCoin = {
  id: number;
  symbol: string;
  name: string;
  status: string;
  currentPrice: string;
  change24h?: string;
  priceInr?: number;
};

export type PriceTick = { symbol: string; usdt: number; inr: number; change24h: number; volume24h: number; ts: number };

export type ApiKycRecord = {
  id: number; userId: number; level: number; status: 'pending' | 'approved' | 'rejected' | string;
  fullName: string | null; dob: string | null; address: string | null;
  panNumber: string | null; aadhaarNumber: string | null;
  panDocUrl: string | null; aadhaarDocUrl: string | null; selfieUrl: string | null;
  rejectReason: string | null; reviewedAt: string | null; createdAt: string;
};

export type ApiReferStats = {
  referralCode: string | null;
  referredCount: number;
  referredKycCount: number;
  estimatedEarnings: number;
  recent: { id: number; name: string; kycLevel: number | null; createdAt: string }[];
};

export type ApiOtpSendRes = {
  otpId: number; expiresInSec: number; delivered: boolean; devCode?: string; message: string;
};

export type ApiNetwork = {
  id: number;
  coinId: number;
  name: string;
  symbol: string;
  minWithdraw: string;
  withdrawFee: string;
  memoRequired?: boolean;
  status: string;
};

// ─── Compatibility namespaces for cryptox-mobile UI tabs ──────────────────────
let _bearerToken: string | null = null;
export function setToken(t: string | null) { _bearerToken = t; }
export function getToken() { return _bearerToken; }

type MarketRow = {
  symbol: string; base: string; quote: string;
  price: number; change24h: number; volume24h: number;
  high24h: number; low24h: number;
  tradingEnabled?: boolean; futuresEnabled?: boolean;
  createdAt?: number;
};

let _coinsCache: ApiCoin[] | null = null;
async function getCoinsCached(): Promise<ApiCoin[]> {
  if (_coinsCache) return _coinsCache;
  _coinsCache = await api.get<ApiCoin[]>('/coins');
  setTimeout(() => { _coinsCache = null; }, 60_000);
  return _coinsCache;
}

function pairToMarket(p: any, coinById: Map<number, ApiCoin>): MarketRow {
  const base = coinById.get(p.baseCoinId)?.symbol ?? 'UNK';
  const quote = coinById.get(p.quoteCoinId)?.symbol ?? 'UNK';
  return {
    symbol: p.symbol,
    base, quote,
    price: Number(p.lastPrice ?? 0),
    change24h: Number(p.change24h ?? 0),
    volume24h: Number(p.volume24h ?? 0),
    high24h: Number(p.high24h ?? 0),
    low24h: Number(p.low24h ?? 0),
    tradingEnabled: p.tradingEnabled !== false,
    futuresEnabled: !!p.futuresEnabled,
    createdAt: p.createdAt ? new Date(p.createdAt).getTime() : 0,
  };
}

export const marketApi = {
  getMarkets: async (): Promise<MarketRow[]> => {
    const [pairs, coins] = await Promise.all([
      api.get<any[]>('/pairs'),
      getCoinsCached(),
    ]);
    const m = new Map(coins.map(c => [c.id, c]));
    return pairs.map(p => pairToMarket(p, m));
  },
  getCandles: async (symbol: string, count = 100, interval = "1m"): Promise<any[]> => {
    const data = await api.get<any>(`/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${count}&source=auto`);
    const candles = Array.isArray(data) ? data : (data?.candles ?? []);
    return candles.map((c: any) => ({
      time: c.time ?? c.t ?? c[0],
      open: Number(c.open ?? c.o ?? c[1]),
      high: Number(c.high ?? c.h ?? c[2]),
      low: Number(c.low ?? c.l ?? c[3]),
      close: Number(c.close ?? c.c ?? c[4]),
      volume: Number(c.volume ?? c.v ?? c[5] ?? 0),
    }));
  },
  getOrderbook: async (symbol: string): Promise<{ bids: [number, number][]; asks: [number, number][] }> => {
    // Redis-backed endpoint — symbol is no-slash form (e.g. BTCINR, BTCUSDT)
    const sym = String(symbol).replace("/", "").toUpperCase();
    const r = await api.get<any>(`/orderbook/${encodeURIComponent(sym)}?levels=20`);
    return { bids: r?.bids ?? [], asks: r?.asks ?? [] };
  },
  getTrades: async (symbol: string): Promise<any[]> => {
    const sym = String(symbol).replace("/", "").toUpperCase();
    const r = await api.get<any>(`/trades/${encodeURIComponent(sym)}/recent?limit=30`);
    return Array.isArray(r?.trades) ? r.trades : (Array.isArray(r) ? r : []);
  },
};

export const settingsApi = {
  getAll: async (): Promise<Record<string, string>> => {
    try { return await api.get<Record<string, string>>('/settings'); } catch { return {}; }
  },
};

export const promoApi = {
  getBanners: async (): Promise<any[]> => {
    try { return await api.get<any[]>('/banners?platform=mobile'); } catch { return []; }
  },
  getPromotions: async (): Promise<any[]> => {
    try { return await api.get<any[]>('/promotions'); } catch { return []; }
  },
};

export const walletApi = {
  getBalances: async (): Promise<{ balances: any[]; totalUsd: number; totalInr: number }> => {
    const wallets = await api.get<ApiWallet[]>('/wallets');
    let totalUsd = 0;
    const balances = wallets.map(w => {
      const bal = Number(w.balance) + Number(w.locked);
      const px = Number(w.coinPrice ?? 0);
      const usd = bal * px;
      totalUsd += usd;
      return {
        currency: w.coinSymbol, name: w.coinName, walletType: w.walletType,
        balance: bal, available: Number(w.balance), locked: Number(w.locked),
        usdValue: usd, price: px,
      };
    });
    return { balances, totalUsd, totalInr: totalUsd * 84 };
  },
  getTransactions: async (): Promise<any[]> => {
    try { return await api.get<any[]>('/transactions'); } catch { return []; }
  },
};

export const tradingApi = {
  getOrders: async (): Promise<any[]> => api.get<any[]>('/orders'),
  getHistory: async (): Promise<any[]> => {
    try { return await api.get<any[]>('/orders?status=filled'); } catch { return []; }
  },
  placeOrder: async (body: { pair: string; side: 'buy' | 'sell'; type: 'market' | 'limit'; price?: number; quantity: number }) => {
    const pairs = await api.get<any[]>('/pairs');
    const p = pairs.find(x => x.symbol === body.pair || x.symbol === body.pair.replace('/', ''));
    if (!p) throw new ApiError(404, `Pair ${body.pair} not found`);
    return api.post('/orders', { pairId: p.id, side: body.side, type: body.type, price: body.price, qty: body.quantity });
  },
  cancelOrder: async (id: number) => api.post(`/orders/${id}/cancel`),
};

export const futuresApi = {
  getMarkets: async (): Promise<MarketRow[]> => {
    const all = await marketApi.getMarkets();
    return all.filter(m => m.futuresEnabled);
  },
  getPositions: async (): Promise<any[]> => {
    try { return await api.get<any[]>('/positions'); } catch { return []; }
  },
};

export const userApi = {
  getStats: async (): Promise<any> => {
    try {
      const [me, fees] = await Promise.all([
        api.get<any>('/auth/me').catch(() => null),
        api.get<any>('/fees/my').catch(() => null),
      ]);
      return {
        user: me?.user ?? null,
        volume30d: fees?.volume30dUsdt ?? 0,
        vipTier: fees?.tier ?? me?.user?.vipTier ?? 0,
        makerFee: fees?.makerFee ?? 0.001,
        takerFee: fees?.takerFee ?? 0.001,
        commissionEarned: fees?.commissionEarned ?? 0,
      };
    } catch { return { user: null, volume30d: 0, vipTier: 0, makerFee: 0.001, takerFee: 0.001, commissionEarned: 0 }; }
  },
};

export const authApi = {
  me: async () => {
    const r = await api.get<{ user: ApiUser }>('/auth/me');
    return r.user;
  },
  login: async (body: { email: string; password: string }) => {
    const r = await api.post<{ user: ApiUser }>('/auth/login', body);
    return { token: '', user: r.user };
  },
  register: async (body: { email: string; password: string; firstName?: string }) => {
    const r = await api.post<{ user: ApiUser }>('/auth/register', { ...body, name: body.firstName ?? '' });
    return { token: '', user: r.user };
  },
  logout: async () => api.post('/auth/logout'),
};
