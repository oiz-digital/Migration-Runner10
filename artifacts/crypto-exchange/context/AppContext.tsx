import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme, Platform } from 'react-native';
import { api, type ApiUser, type ApiWallet, type ApiBank, type ApiCoin, type ApiNetwork } from '@/lib/api';

export type Theme = 'dark' | 'light' | 'system';
export type Language = 'en' | 'hi';
export type KycLevel = 0 | 1 | 2 | 3;
export type WalletType = 'spot' | 'inr' | 'earn' | 'futures';

export interface User {
  uid: string;
  name: string;
  email: string;
  phone: string;
  kycLevel: KycLevel;
  kycStatus: 'pending' | 'under_review' | 'verified' | 'rejected';
  subscriptionLevel: 0 | 1 | 2 | 3;
  monthlyVolume: number;
  referralCode: string;
  referralEarnings: number;
  totalTdsPaid: number;
  totalTdsUnpaid: number;
  totalFeesPaid: number;
  totalEarned: number;
  isLoggedIn: boolean;
}

export interface Coin {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  marketCap: number;
}

export interface WalletBalance {
  symbol: string;
  walletType: WalletType;
  available: number;
  locked: number;
  inrValue: number;
}

export interface Order {
  id: string;
  symbol: string;
  type: 'market' | 'limit' | 'stop';
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  filled: number;
  status: 'open' | 'filled' | 'cancelled' | 'partial';
  timestamp: number;
  fee: number;
  tds: number;
  total: number;
  invoiceId: string;
}

export interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  pnlPercent: number;
  leverage: number;
  liquidationPrice: number;
  margin: number;
}

export interface Transaction {
  id: string;
  type: 'deposit' | 'withdraw' | 'transfer' | 'trade' | 'earn' | 'refer';
  symbol: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  timestamp: number;
  txHash?: string;
  network?: string;
  fee: number;
  address?: string;
  bankRef?: string;
  walletType?: WalletType;
}

export interface Bank {
  id: string;
  accountHolder: string;
  accountNumber: string;
  ifsc: string;
  bankName: string;
  status: 'under_review' | 'verified' | 'rejected';
  addedAt: number;
}

export interface LoginLog {
  id: string;
  device: string;
  location: string;
  ip: string;
  timestamp: number;
  status: 'success' | 'failed';
}

export interface ActiveSession {
  id: string;
  device: string;
  location: string;
  lastActive: number;
  isCurrent: boolean;
}

export interface EarnProduct {
  id: string;
  symbol: string;
  type: 'simple' | 'advanced';
  apy: number;
  minAmount: number;
  duration?: number; // days for advanced
  totalLocked: number;
  available: boolean;
}

export interface EarnPosition {
  id: string;
  productId: string;
  symbol: string;
  type: 'simple' | 'advanced';
  amount: number;
  apy: number;
  startDate: number;
  endDate?: number;
  earned: number;
  status: 'active' | 'matured' | 'redeemed';
  autoMaturity: boolean;
}

export interface FeeTier {
  level: number;
  name: string;
  minVolume: number;
  spotMaker: number;
  spotTaker: number;
  futuresMaker: number;
  futuresTaker: number;
  withdrawDiscount: number;
}

export interface KycLevelInfo {
  level: KycLevel;
  name: string;
  withdrawLimitDaily: number;
  withdrawLimitMonthly: number;
  depositLimit: number;
  features: string[];
  required: string[];
}

interface AppContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
  effectiveTheme: 'dark' | 'light';
  language: Language;
  setLanguage: (l: Language) => void;
  user: User;
  setUser: (u: Partial<User>) => void;
  authBootstrapped: boolean;
  loginWithApi: (email: string, password: string) => Promise<void>;
  signupWithApi: (data: { name: string; email: string; phone: string; password: string; referralCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
  apiWallets: ApiWallet[];
  apiBanks: ApiBank[];
  apiCoins: ApiCoin[];
  apiPairs: any[];
  inrUsdtRate: number;
  refreshWallets: () => Promise<void>;
  refreshBanks: () => Promise<void>;
  refreshCoins: () => Promise<void>;
  fetchNetworks: (coinId: number) => Promise<ApiNetwork[]>;
  addBankApi: (data: { bankName: string; accountNumber: string; ifsc: string; holderName: string }) => Promise<ApiBank>;
  removeBankApi: (id: number) => Promise<void>;
  withdrawInrApi: (bankId: number, amount: number, otpId: number) => Promise<any>;
  withdrawCryptoApi: (data: { coinId: number; networkId: number; amount: number; toAddress: string; memo?: string; otpId: number }) => Promise<any>;
  fetchDepositGateways: () => Promise<any[]>;
  submitInrDepositApi: (data: { gatewayId: number; amount: number; utr?: string; notes?: string }) => Promise<any>;
  fetchInrDeposits: () => Promise<any[]>;
  fetchDepositAddress: (coinId: number, networkId: number) => Promise<any>;
  notifyCryptoDepositApi: (data: { coinId: number; networkId: number; amount: number; txHash: string }) => Promise<any>;
  fetchCryptoDeposits: () => Promise<any[]>;
  coins: Coin[];
  walletBalances: WalletBalance[];
  updateBalance: (symbol: string, walletType: WalletType, delta: number) => void;
  orders: Order[];
  addOrder: (o: Order) => void;
  cancelOrder: (id: string) => void;
  updateOrderFill: (id: string, filled: number) => void;
  positions: Position[];
  transactions: Transaction[];
  addTransaction: (t: Transaction) => void;
  banks: Bank[];
  addBank: (b: Bank) => void;
  updateBankStatus: (id: string, status: Bank['status']) => void;
  loginLogs: LoginLog[];
  activeSessions: ActiveSession[];
  botEnabled: boolean;
  setBotEnabled: (v: boolean) => void;
  earnProducts: EarnProduct[];
  earnPositions: EarnPosition[];
  addEarnPosition: (p: EarnPosition) => void;
  feeTiers: FeeTier[];
  currentFeeTier: FeeTier;
  kycLevels: KycLevelInfo[];
  totalPortfolioValue: number;
  todayPnl: number;
  todayPnlPercent: number;
}

export const MOCK_COINS: Coin[] = [];

const DEFAULT_FEE_TIER: FeeTier = {
  level: 0, name: 'Regular', minVolume: 0,
  spotMaker: 0.20, spotTaker: 0.25,
  futuresMaker: 0.05, futuresTaker: 0.07,
  withdrawDiscount: 0,
};

const KYC_LEVELS: KycLevelInfo[] = [
  {
    level: 0, name: 'Unverified',
    withdrawLimitDaily: 0, withdrawLimitMonthly: 0, depositLimit: 0,
    features: ['Browse markets', 'View prices'],
    required: [],
  },
  {
    level: 1, name: 'Basic KYC',
    withdrawLimitDaily: 50000, withdrawLimitMonthly: 500000, depositLimit: 100000,
    features: ['Spot trading', 'INR deposit/withdraw', 'Basic earn'],
    required: ['Email verification', 'Phone verification', 'PAN card'],
  },
  {
    level: 2, name: 'Intermediate KYC',
    withdrawLimitDaily: 500000, withdrawLimitMonthly: 5000000, depositLimit: 1000000,
    features: ['Futures trading', 'All earn products', 'Higher limits', 'Refer & earn'],
    required: ['Aadhaar card', 'Live selfie verification', 'Address proof'],
  },
  {
    level: 3, name: 'Advanced KYC',
    withdrawLimitDaily: 5000000, withdrawLimitMonthly: 50000000, depositLimit: 10000000,
    features: ['Unlimited limits', 'OTC trading', 'API trading', 'Priority support'],
    required: ['Income proof', 'Source of funds', 'Video KYC'],
  },
];

const defaultUser: User = {
  uid: '',
  name: '',
  email: '',
  phone: '',
  kycLevel: 0,
  kycStatus: 'pending',
  subscriptionLevel: 0,
  monthlyVolume: 0,
  referralCode: '',
  referralEarnings: 0,
  totalTdsPaid: 0,
  totalTdsUnpaid: 0,
  totalFeesPaid: 0,
  totalEarned: 0,
  isLoggedIn: false,
};

export const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<Theme>('dark');
  const [language, setLanguageState] = useState<Language>('en');
  const [user, setUserState] = useState<User>(defaultUser);
  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [apiWallets, setApiWallets] = useState<ApiWallet[]>([]);
  const [apiBanks, setApiBanks] = useState<ApiBank[]>([]);
  const [apiCoins, setApiCoins] = useState<ApiCoin[]>([]);
  const [apiPairs, setApiPairs] = useState<any[]>([]);
  const [inrUsdtRate, setInrUsdtRate] = useState<number>(84);

  const refreshWallets = async () => {
    try { setApiWallets(await api.get<ApiWallet[]>('/wallets')); } catch {}
  };
  const refreshBanks = async () => {
    try { setApiBanks(await api.get<ApiBank[]>('/banks')); } catch {}
  };
  const refreshCoins = async () => {
    try { setApiCoins(await api.get<ApiCoin[]>('/coins')); } catch {}
  };
  const refreshPairs = async () => {
    try { setApiPairs(await api.get<any[]>('/pairs')); } catch {}
  };
  const fetchNetworks = async (coinId: number) => {
    try { return await api.get<ApiNetwork[]>(`/networks?coinId=${coinId}`); } catch { return []; }
  };
  const addBankApi = async (data: { bankName: string; accountNumber: string; ifsc: string; holderName: string }) => {
    const created = await api.post<ApiBank>('/banks', data);
    await refreshBanks();
    return created;
  };
  const removeBankApi = async (id: number) => {
    await api.delete(`/banks/${id}`);
    await refreshBanks();
  };
  const withdrawInrApi = async (bankId: number, amount: number, otpId: number) => {
    const wd = await api.post('/inr-withdrawals', { bankId, amount, otpId });
    await refreshWallets();
    return wd;
  };
  const withdrawCryptoApi = async (data: { coinId: number; networkId: number; amount: number; toAddress: string; memo?: string; otpId: number }) => {
    const wd = await api.post('/crypto-withdrawals', data);
    await refreshWallets();
    return wd;
  };

  const fetchDepositGateways = async () => {
    try { return await api.get<any[]>('/gateways?direction=deposit'); } catch { return []; }
  };
  const submitInrDepositApi = async (data: { gatewayId: number; amount: number; utr?: string; notes?: string }) => {
    return await api.post('/inr-deposits', data);
  };
  const fetchInrDeposits = async () => {
    try { return await api.get<any[]>('/inr-deposits'); } catch { return []; }
  };
  const fetchDepositAddress = async (coinId: number, networkId: number) => {
    return await api.get<any>(`/deposit-address?coinId=${coinId}&networkId=${networkId}`);
  };
  const notifyCryptoDepositApi = async (data: { coinId: number; networkId: number; amount: number; txHash: string }) => {
    return await api.post('/crypto-deposits/notify', data);
  };
  const fetchCryptoDeposits = async () => {
    try { return await api.get<any[]>('/crypto-deposits'); } catch { return []; }
  };

  const apiUserToUser = (u: ApiUser): User => ({
    ...defaultUser,
    uid: u.uid,
    name: u.name || u.email.split('@')[0],
    email: u.email,
    phone: u.phone || '',
    kycLevel: (u.kycLevel ?? 0) as 0 | 1 | 2 | 3,
    kycStatus: (u.kycStatus as User['kycStatus']) || 'pending',
    subscriptionLevel: (u.vipTier ?? 0) as 0 | 1 | 2 | 3,
    referralCode: u.referralCode,
    isLoggedIn: true,
  });

  const loginWithApi = async (email: string, password: string) => {
    const res = await api.post<{ user: ApiUser }>('/auth/login', { email, password });
    setUserState(apiUserToUser(res.user));
    await Promise.all([refreshWallets(), refreshBanks(), refreshCoins(), refreshPairs(), refreshOrders(), refreshPositions(), refreshTransactions(), refreshFees(), refreshEarnPositions()]);
  };
  const signupWithApi = async (data: { name: string; email: string; phone: string; password: string; referralCode?: string }) => {
    const res = await api.post<{ user: ApiUser }>('/auth/register', data);
    setUserState(apiUserToUser(res.user));
    await Promise.all([refreshWallets(), refreshBanks(), refreshCoins(), refreshPairs(), refreshOrders(), refreshPositions(), refreshTransactions(), refreshFees(), refreshEarnPositions()]);
  };
  const logout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    await api.clearToken();
    setUserState({ ...defaultUser, isLoggedIn: false });
    setApiWallets([]); setApiBanks([]);
    setOrders([]); setPositions([]); setTransactions([]); setEarnPositions([]);
    setCurrentFeeTier(DEFAULT_FEE_TIER); setFeeTiers([DEFAULT_FEE_TIER]);
  };
  const [coins, setCoins] = useState<Coin[]>([]);
  const [walletBalances, setWalletBalances] = useState<WalletBalance[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loginLogs] = useState<LoginLog[]>([]);
  const [activeSessions] = useState<ActiveSession[]>([]);
  const [botEnabled, setBotEnabled] = useState(true);
  const [earnPositions, setEarnPositions] = useState<EarnPosition[]>([]);
  const [feeTiers, setFeeTiers] = useState<FeeTier[]>([DEFAULT_FEE_TIER]);
  const [currentFeeTier, setCurrentFeeTier] = useState<FeeTier>(DEFAULT_FEE_TIER);

  const effectiveTheme: 'dark' | 'light' = theme === 'system' ? (systemScheme ?? 'dark') : theme;

  // Derive legacy `coins[]` (used by markets/home/trade screens) from live apiCoins
  useEffect(() => {
    setCoins(apiCoins
      .filter(c => c.symbol !== 'INR')
      .map(c => {
        const inr = Number(c.priceInr ?? 0) || (Number(c.currentPrice) || 0) * (inrUsdtRate || 84);
        const ch = Number(c.change24h) || 0;
        return {
          symbol: c.symbol,
          name: c.name,
          price: inr,
          change24h: parseFloat(ch.toFixed(2)),
          volume24h: 0,
          high24h: inr,
          low24h: inr,
          marketCap: 0,
        };
      }));
  }, [apiCoins, inrUsdtRate]);

  // Derive walletBalances from live apiWallets
  useEffect(() => {
    setWalletBalances(apiWallets.map(w => {
      const available = Number(w.balance) || 0;
      const locked = Number(w.locked) || 0;
      const usdt = Number(w.coinPrice) || 0;
      const rate = w.coinSymbol === 'INR' ? 1 : w.coinSymbol === 'USDT' ? inrUsdtRate : (usdt * inrUsdtRate);
      return {
        symbol: w.coinSymbol,
        walletType: w.walletType as WalletType,
        available, locked,
        inrValue: (available + locked) * rate,
      };
    }));
  }, [apiWallets, inrUsdtRate]);

  // ---- Live data refreshers (use apiPairs ref via closure of latest state) ----
  const refreshOrders = async () => {
    try {
      const rows = await api.get<any[]>('/orders');
      const list = await api.get<any[]>('/pairs').catch(() => apiPairs);
      const mapped: Order[] = rows.map(r => {
        const p = list.find((x: any) => x.id === r.pairId);
        const sym = p?.symbol || `PAIR${r.pairId}`;
        const qty = Number(r.qty) || 0;
        const price = Number(r.price) || Number(r.avgPrice) || 0;
        const filled = Number(r.filledQty) || 0;
        return {
          id: r.uid || String(r.id),
          symbol: sym,
          type: (r.type as any) || 'limit',
          side: (r.side as any) || 'buy',
          price, quantity: qty, filled,
          status: (r.status as any) || 'open',
          timestamp: new Date(r.createdAt).getTime(),
          fee: Number(r.fee) || 0,
          tds: Number(r.tds) || 0,
          total: price * qty,
          invoiceId: r.uid || String(r.id),
        };
      });
      setOrders(mapped);
    } catch {}
  };

  const refreshPositions = async () => {
    try {
      const rows = await api.get<any[]>('/positions');
      const list = apiPairs.length ? apiPairs : await api.get<any[]>('/pairs').catch(() => []);
      const mapped: Position[] = rows.map(r => {
        const p = list.find((x: any) => x.id === r.pairId);
        const entry = Number(r.entryPrice) || 0;
        const mark = Number(r.markPrice) || entry;
        const qty = Number(r.qty) || 0;
        const margin = Number(r.marginAmount) || 0;
        const pnl = Number(r.unrealizedPnl) || 0;
        return {
          symbol: p?.symbol || `PAIR${r.pairId}`,
          side: (r.side as any) || 'long',
          size: qty,
          entryPrice: entry, markPrice: mark,
          pnl, pnlPercent: margin > 0 ? (pnl / margin) * 100 : 0,
          leverage: r.leverage || 1,
          liquidationPrice: Number(r.liquidationPrice) || 0,
          margin,
        };
      });
      setPositions(mapped);
    } catch {}
  };

  const refreshTransactions = async () => {
    try {
      const rows = await api.get<any[]>('/trades');
      const list = apiPairs.length ? apiPairs : await api.get<any[]>('/pairs').catch(() => []);
      const mapped: Transaction[] = rows.map(r => {
        const p = list.find((x: any) => x.id === r.pairId);
        const sym = p?.symbol || `PAIR${r.pairId}`;
        const qty = Number(r.qty) || 0;
        const price = Number(r.price) || 0;
        return {
          id: r.uid || String(r.id),
          type: 'trade',
          symbol: sym,
          amount: qty * price,
          status: 'completed',
          timestamp: new Date(r.createdAt).getTime(),
          fee: Number(r.fee) || 0,
          walletType: 'spot',
        };
      });
      setTransactions(mapped);
    } catch {}
  };

  const refreshFees = async () => {
    try {
      const data = await api.get<any>('/fees/my');
      const tiers = (data.tiers || []) as any[];
      if (tiers.length) {
        setFeeTiers(tiers.map((t, i) => ({
          level: t.level ?? i,
          name: t.name || (t.level === 0 ? 'Regular' : `VIP ${t.level}`),
          minVolume: Number(t.minVolume ?? t.volumeUsdt ?? 0),
          spotMaker: Number(t.spotMaker ?? t.makerFee ?? 0),
          spotTaker: Number(t.spotTaker ?? t.takerFee ?? 0),
          futuresMaker: Number(t.futuresMaker ?? 0),
          futuresTaker: Number(t.futuresTaker ?? 0),
          withdrawDiscount: Number(t.withdrawDiscount ?? 0),
        })));
      }
      const cur = data.currentTier;
      if (cur) {
        setCurrentFeeTier({
          level: cur.level ?? 0,
          name: cur.name || (cur.level === 0 ? 'Regular' : `VIP ${cur.level}`),
          minVolume: Number(cur.minVolume ?? 0),
          spotMaker: Number(cur.spotMaker ?? 0),
          spotTaker: Number(cur.spotTaker ?? 0),
          futuresMaker: Number(cur.futuresMaker ?? 0),
          futuresTaker: Number(cur.futuresTaker ?? 0),
          withdrawDiscount: Number(cur.withdrawDiscount ?? 0),
        });
      }
    } catch {}
  };

  const refreshEarnPositions = async () => {
    try {
      const rows = await api.get<any[]>('/earn/positions');
      const mapped: EarnPosition[] = rows.map(r => ({
        id: r.uid || String(r.id),
        productId: String(r.productId || ''),
        symbol: r.coinSymbol || r.symbol || '',
        type: (r.type as any) || 'simple',
        amount: Number(r.amount) || 0,
        apy: Number(r.apy) || 0,
        startDate: new Date(r.startedAt || r.createdAt).getTime(),
        endDate: r.endsAt ? new Date(r.endsAt).getTime() : undefined,
        earned: Number(r.accruedReward || r.earned || 0),
        status: (r.status as any) || 'active',
        autoMaturity: !!r.autoRenew,
      }));
      setEarnPositions(mapped);
    } catch {}
  };

  useEffect(() => {
    loadSettings();
    (async () => {
      // Always fetch public market data (works for guests too)
      void refreshCoins();
      void refreshPairs();
      try {
        const me = await api.get<{ user: ApiUser }>('/auth/me');
        setUserState(apiUserToUser(me.user));
        await Promise.all([
          refreshWallets(), refreshBanks(),
          refreshOrders(), refreshPositions(), refreshTransactions(),
          refreshFees(), refreshEarnPositions(),
        ]);
      } catch {
        // Server says not logged in — clear any stale token + reset to defaults
        await api.clearToken();
        setUserState({ ...defaultUser, isLoggedIn: false });
        setApiWallets([]); setApiBanks([]);
      } finally { setAuthBootstrapped(true); }
    })();
    const interval: ReturnType<typeof setInterval> | null = null;

    // Live prices: WebSocket primary, REST fallback (adaptive polling)
    let ws: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let wsHealthy = false;
    const applyTicks = (inrRate: number, ticks: any[]) => {
      if (typeof inrRate === 'number' && inrRate > 0) setInrUsdtRate(inrRate);
      const tickBySym = new Map<string, any>();
      for (const t of ticks) tickBySym.set(t.symbol, t);
      setApiCoins(prev => {
        const map = new Map(prev.map(c => [c.symbol, c]));
        for (const t of ticks) {
          const ex = map.get(t.symbol);
          if (ex) map.set(t.symbol, { ...ex, currentPrice: String(t.usdt), change24h: String(t.change24h), priceInr: t.inr });
        }
        return Array.from(map.values());
      });
      // Also push live price into apiPairs so trade/markets screens tick live (not just on REST refresh)
      setApiPairs(prev => {
        if (!prev?.length || !ticks.length) return prev;
        const coinById = new Map<number, any>();
        // apiCoins ref via closure isn't fresh — derive base/quote symbols from cached map below at call time.
        // Build a lookup of coinId→symbol from previous pairs' embedded base/quote if present, else fallback by id ↔ ticker.
        // Simpler: walk pairs, derive symbol from p.symbol (e.g. "SOLINR") and split off known quotes.
        const KNOWN_QUOTES = ['USDT', 'INR', 'BTC', 'ETH', 'BNB'];
        let changed = false;
        const next = prev.map((p: any) => {
          const sym: string = p.symbol || '';
          const quote = KNOWN_QUOTES.find(q => sym.endsWith(q));
          if (!quote) return p;
          const base = sym.slice(0, sym.length - quote.length);
          const tk = tickBySym.get(base);
          if (!tk) return p;
          const newLast = quote === 'USDT' ? Number(tk.usdt) : (quote === 'INR' ? Number(tk.inr) : Number(p.lastPrice));
          const newChg = Number(tk.change24h);
          if (Number(p.lastPrice) === newLast && Number(p.change24h) === newChg) return p;
          changed = true;
          return { ...p, lastPrice: String(newLast), change24h: String(newChg) };
        });
        return changed ? next : prev;
      });
    };
    const restFallback = async () => {
      try {
        const r = await api.get<{ inrRate: number; ticks: any[] }>('/prices');
        applyTicks(r.inrRate, r.ticks);
      } catch {}
    };
    const startPolling = (intervalMs: number) => {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(restFallback, intervalMs);
    };
    const connectWs = () => {
      try {
        const base = (Platform.OS === 'web')
          ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws/prices`
          : `wss://${process.env.EXPO_PUBLIC_DOMAIN}/api/ws/prices`;
        ws = new WebSocket(base);
        ws.onopen = () => { wsHealthy = true; startPolling(20000); };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
            if (msg?.type === 'snapshot' || msg?.type === 'tick') {
              applyTicks(msg.inrRate, msg.ticks || []);
            }
          } catch {}
        };
        ws.onclose = () => { wsHealthy = false; startPolling(2000); setTimeout(connectWs, 4000); };
        ws.onerror = () => { wsHealthy = false; startPolling(2000); try { ws?.close(); } catch {} };
      } catch { startPolling(2000); }
    };
    // Start with fast polling (2s) — switches to slow (20s) once WS is healthy
    startPolling(2000);
    connectWs();
    void restFallback();

    return () => { if (interval) clearInterval(interval); if (pollTimer) clearInterval(pollTimer); try { ws?.close(); } catch {} };
  }, []);

  const loadSettings = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem('theme');
      const savedLang = await AsyncStorage.getItem('language');
      if (savedTheme) setThemeState(savedTheme as Theme);
      if (savedLang) setLanguageState(savedLang as Language);
      // NOTE: user state is hydrated authoritatively from /auth/me, not local cache.
    } catch {}
  };

  const setTheme = async (t: Theme) => {
    setThemeState(t);
    try { await AsyncStorage.setItem('theme', t); } catch {}
  };

  const setLanguage = async (l: Language) => {
    setLanguageState(l);
    try { await AsyncStorage.setItem('language', l); } catch {}
  };

  const setUser = async (updates: Partial<User>) => {
    const updated = { ...user, ...updates };
    setUserState(updated);
    try { await AsyncStorage.setItem('user', JSON.stringify(updated)); } catch {}
  };

  const updateBalance = (symbol: string, walletType: WalletType, delta: number) => {
    setWalletBalances(prev => {
      const existing = prev.find(b => b.symbol === symbol && b.walletType === walletType);
      const coin = apiCoins.find(c => c.symbol === symbol);
      const usdt = coin ? Number(coin.currentPrice) : 0;
      const rate = symbol === 'INR' ? 1 : symbol === 'USDT' ? inrUsdtRate : (usdt * inrUsdtRate);
      if (existing) {
        return prev.map(b => b.symbol === symbol && b.walletType === walletType
          ? { ...b, available: Math.max(0, b.available + delta), inrValue: Math.max(0, b.available + delta) * rate }
          : b);
      }
      return [...prev, { symbol, walletType, available: Math.max(0, delta), locked: 0, inrValue: Math.max(0, delta) * rate }];
    });
  };

  const addOrder = (o: Order) => setOrders(prev => [o, ...prev]);
  const cancelOrder = (id: string) => setOrders(prev => prev.map(o => o.id === id && (o.status === 'open' || o.status === 'partial') ? { ...o, status: 'cancelled' } : o));
  const updateOrderFill = (id: string, filled: number) => setOrders(prev => prev.map(o => {
    if (o.id !== id) return o;
    const fillPct = filled / o.quantity;
    return { ...o, filled, status: fillPct >= 1 ? 'filled' : fillPct > 0 ? 'partial' : 'open' };
  }));
  const addTransaction = (t: Transaction) => setTransactions(prev => [t, ...prev]);
  const addBank = (b: Bank) => setBanks(prev => [...prev, b]);
  const updateBankStatus = (id: string, status: Bank['status']) => {
    setBanks(prev => prev.map(b => b.id === id ? { ...b, status } : b));
  };
  const addEarnPosition = (p: EarnPosition) => setEarnPositions(prev => [p, ...prev]);

  const totalPortfolioValue = walletBalances.reduce((s, b) => s + b.inrValue, 0);
  const todayPnl = 0;
  const todayPnlPercent = 0;

  return (
    <AppContext.Provider value={{
      theme, setTheme, effectiveTheme,
      language, setLanguage,
      user, setUser, authBootstrapped, loginWithApi, signupWithApi, logout,
      apiWallets, apiBanks, apiCoins, apiPairs, inrUsdtRate,
      refreshWallets, refreshBanks, refreshCoins, fetchNetworks,
      addBankApi, removeBankApi, withdrawInrApi, withdrawCryptoApi,
      fetchDepositGateways, submitInrDepositApi, fetchInrDeposits,
      fetchDepositAddress, notifyCryptoDepositApi, fetchCryptoDeposits,
      coins, walletBalances, updateBalance,
      orders, addOrder, cancelOrder, updateOrderFill,
      positions, transactions, addTransaction,
      banks, addBank, updateBankStatus,
      loginLogs, activeSessions,
      botEnabled, setBotEnabled,
      earnProducts: [], earnPositions, addEarnPosition,
      feeTiers, currentFeeTier,
      kycLevels: KYC_LEVELS,
      totalPortfolioValue, todayPnl, todayPnlPercent,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
