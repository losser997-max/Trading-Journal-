import React, { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, BarChart, Bar, CartesianGrid, Cell, PieChart, Pie, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { Activity, ArrowDownRight, ArrowUpRight, CalendarDays, CheckCircle2, CirclePlus, Download, Filter, Goal, LayoutDashboard, LineChart as LineChartIcon, ListChecks, MoonStar, Plus, RefreshCw, Search, ShieldAlert, SlidersHorizontal, Sparkles, SunMedium, Tag, Target, Trash2, TrendingUp, WalletCards, Wifi, WifiOff } from "lucide-react";

const STORAGE_KEY = "swing-journal-v2";
const QUOTE_REFRESH_MS = 60_000;

const sampleTrades = [
  { id: 1, symbol: "RELIANCE.NS", sector: "Energy", setup: "Breakout", direction: "Long", status: "Closed", entryDate: "2026-05-01", exitDate: "2026-05-08", entry: 2890, exit: 3015, stop: 2835, qty: 10, risk: 550, pnl: 1250, rr: 2.27, holdingDays: 7, notes: "Strong relative strength; clean volume expansion.", discipline: 9, mood: "Calm", mistake: "None", reviewed: true },
  { id: 2, symbol: "TCS.NS", sector: "IT", setup: "Pullback", direction: "Long", status: "Closed", entryDate: "2026-05-03", exitDate: "2026-05-10", entry: 4120, exit: 4068, stop: 4055, qty: 5, risk: 325, pnl: -260, rr: 0.8, holdingDays: 7, notes: "Entered a little early before confirmation.", discipline: 6, mood: "Anxious", mistake: "Late confirmation", reviewed: true },
  { id: 3, symbol: "SBIN.NS", sector: "Financials", setup: "Retest", direction: "Long", status: "Open", entryDate: "2026-05-14", exitDate: "", entry: 820, exit: 0, stop: 795, qty: 40, risk: 1000, pnl: 0, rr: 2.4, holdingDays: 4, notes: "Trend intact. Watching for breakout continuation.", discipline: 8, mood: "Focused", mistake: "", reviewed: false },
  { id: 4, symbol: "HDFCBANK.NS", sector: "Financials", setup: "Support Bounce", direction: "Short", status: "Closed", entryDate: "2026-05-02", exitDate: "2026-05-06", entry: 1540, exit: 1498, stop: 1560, qty: 12, risk: 240, pnl: 504, rr: 2.1, holdingDays: 4, notes: "Sector rotation worked in favor.", discipline: 8, mood: "Confident", mistake: "Scaled out too early", reviewed: true },
];

const setupColors = { Breakout: "#22c55e", Pullback: "#3b82f6", Retest: "#8b5cf6", "Support Bounce": "#f59e0b" };
const cn = (...parts) => parts.filter(Boolean).join(" ");
const fmtMoney = (n) => `${n >= 0 ? "+" : "-"}₹${Math.abs(Number(n || 0)).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const fmtNum = (n) => Number.isFinite(Number(n)) ? Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "0";
const toPct = (n) => `${n >= 0 ? "+" : ""}${Number(n || 0).toFixed(1)}%`;

function normalizeYahooSymbol(symbol) {
  const s = String(symbol || "").trim().toUpperCase();
  if (!s) return "";
  if (s.includes(".") || s.startsWith("^")) return s;
  return `${s}.NS`; // Default for NSE India. Use .BO for BSE or AAPL for US stocks.
}

async function fetchYahooQuote(symbol) {
  const yahooSymbol = normalizeYahooSymbol(symbol);
  const directUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`;
  const urls = [
    directUrl,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(directUrl)}`,
  ];

  let lastError;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      const meta = result?.meta;
      const price = meta?.regularMarketPrice ?? meta?.previousClose;
      if (!price) throw new Error("No price returned");
      return {
        symbol: yahooSymbol,
        ltp: Number(price),
        previousClose: Number(meta?.previousClose || 0),
        currency: meta?.currency || "INR",
        exchangeName: meta?.exchangeName || "",
        marketState: meta?.marketState || "",
        fetchedAt: new Date().toLocaleTimeString(),
        error: null,
      };
    } catch (err) {
      lastError = err;
    }
  }
  return { symbol: yahooSymbol, ltp: null, previousClose: null, fetchedAt: new Date().toLocaleTimeString(), error: lastError?.message || "Quote unavailable" };
}

function calcMetrics(trades) {
  const closed = trades.filter((t) => t.status === "Closed");
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  return {
    closedCount: closed.length,
    openCount: trades.filter((t) => t.status === "Open").length,
    winRate,
    totalPnl,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit,
    expectancy: closed.length ? totalPnl / closed.length : 0,
    avgRR: closed.length ? closed.reduce((s, t) => s + (t.rr || 0), 0) / closed.length : 0,
    avgHold: closed.length ? closed.reduce((s, t) => s + (t.holdingDays || 0), 0) / closed.length : 0,
    largestWin: closed.length ? Math.max(...closed.map((t) => t.pnl)) : 0,
    largestLoss: closed.length ? Math.min(...closed.map((t) => t.pnl)) : 0,
  };
}

function livePnlForTrade(t, quote) {
  if (t.status !== "Open" || !quote?.ltp) return t.pnl || 0;
  const multiplier = t.direction === "Short" ? -1 : 1;
  return (quote.ltp - t.entry) * t.qty * multiplier;
}

function MetricCard({ title, value, sub, icon: Icon, positive = true }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-black/10 backdrop-blur">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-xs uppercase tracking-wider text-slate-400">{title}</p><h3 className={cn("mt-2 text-2xl font-semibold", positive ? "text-emerald-400" : "text-rose-400")}>{value}</h3>{sub ? <p className="mt-1 text-sm text-slate-400">{sub}</p> : null}</div>
      <div className="rounded-xl bg-white/5 p-3 text-slate-200"><Icon className="h-5 w-5" /></div>
    </div>
  </div>;
}

function SectionTitle({ icon: Icon, title, subtitle }) {
  return <div className="mb-4 flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Icon className="h-5 w-5 text-cyan-400" /><h2 className="text-lg font-semibold text-white">{title}</h2></div>{subtitle ? <p className="mt-1 text-sm text-slate-400">{subtitle}</p> : null}</div></div>;
}

export default function App() {
  const [dark, setDark] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [setupFilter, setSetupFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [trades, setTrades] = useState(sampleTrades);
  const [quotes, setQuotes] = useState({});
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newTrade, setNewTrade] = useState({ symbol: "", sector: "", setup: "Breakout", direction: "Long", status: "Planned", entryDate: "", exitDate: "", entry: "", exit: "", stop: "", qty: "", rr: "2.0", holdingDays: "", notes: "", discipline: "8", mood: "Calm", mistake: "", reviewed: false });

  useEffect(() => { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { try { setTrades(JSON.parse(raw)); } catch {} } }, []);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(trades)); }, [trades]);

  const refreshQuotes = async () => {
    const symbols = [...new Set(trades.filter(t => t.status === "Open").map(t => normalizeYahooSymbol(t.symbol)).filter(Boolean))];
    if (!symbols.length) return;
    setQuoteLoading(true);
    const entries = await Promise.all(symbols.map(async (s) => [s, await fetchYahooQuote(s)]));
    setQuotes(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    setQuoteLoading(false);
  };

  useEffect(() => { refreshQuotes(); const id = setInterval(refreshQuotes, QUOTE_REFRESH_MS); return () => clearInterval(id); }, [trades]);

  const metrics = useMemo(() => calcMetrics(trades), [trades]);
  const liveOpenPnl = useMemo(() => trades.reduce((s, t) => s + livePnlForTrade(t, quotes[normalizeYahooSymbol(t.symbol)]), 0), [trades, quotes]);

  const filteredTrades = useMemo(() => trades.filter((t) => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q || [t.symbol, t.sector, t.setup, t.direction, t.notes, t.mistake].join(" ").toLowerCase().includes(q);
    return matchSearch && (setupFilter === "All" || t.setup === setupFilter) && (statusFilter === "All" || t.status === statusFilter);
  }), [trades, search, setupFilter, statusFilter]);

  const equityData = useMemo(() => { let cum = 0; return trades.filter(t => t.status === "Closed").map(t => { cum += t.pnl; return { name: t.symbol, equity: cum, pnl: t.pnl }; }); }, [trades]);
  const setupData = useMemo(() => Object.values(trades.filter(t => t.status === "Closed").reduce((m, t) => { m[t.setup] ||= { setup: t.setup, pnl: 0, count: 0 }; m[t.setup].pnl += t.pnl; m[t.setup].count++; return m; }, {})), [trades]);
  const monthlyData = useMemo(() => Object.values(trades.filter(t => t.status === "Closed").reduce((m, t) => { const k = t.entryDate?.slice(0,7) || "Unknown"; m[k] ||= { month: k, pnl: 0, trades: 0 }; m[k].pnl += t.pnl; m[k].trades++; return m; }, {})), [trades]);

  const handleAddTrade = (e) => {
    e.preventDefault();
    const entry = Number(newTrade.entry || 0), exit = Number(newTrade.exit || 0), qty = Number(newTrade.qty || 0);
    const pnl = newTrade.status === "Closed" ? (exit - entry) * qty * (newTrade.direction === "Short" ? -1 : 1) : 0;
    const holdingDays = newTrade.holdingDays || (newTrade.entryDate && newTrade.exitDate ? Math.max(1, Math.round((new Date(newTrade.exitDate) - new Date(newTrade.entryDate)) / 86400000)) : 0);
    setTrades(prev => [{ id: Date.now(), ...newTrade, symbol: normalizeYahooSymbol(newTrade.symbol), entry, exit, stop: Number(newTrade.stop || 0), qty, risk: Math.abs((entry - Number(newTrade.stop || 0)) * qty), pnl, rr: Number(newTrade.rr || 0), holdingDays: Number(holdingDays || 0), discipline: Number(newTrade.discipline || 0) }, ...prev]);
    setShowForm(false);
    setNewTrade({ symbol: "", sector: "", setup: "Breakout", direction: "Long", status: "Planned", entryDate: "", exitDate: "", entry: "", exit: "", stop: "", qty: "", rr: "2.0", holdingDays: "", notes: "", discipline: "8", mood: "Calm", mistake: "", reviewed: false });
  };

  const deleteTrade = (id) => setTrades(prev => prev.filter(t => t.id !== id));
  const themeClass = dark ? "dark bg-slate-950 text-white" : "bg-slate-100 text-slate-900";

  return <div className={cn("min-h-screen transition-colors", themeClass)}>
    <div className="mx-auto flex max-w-[1600px] gap-5 p-4 lg:p-6">
      <aside className="hidden w-72 shrink-0 rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-black/20 backdrop-blur lg:block">
        <div className="mb-6 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 p-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-cyan-500/20 p-3 text-cyan-300"><WalletCards className="h-6 w-6" /></div><div><p className="text-xs uppercase tracking-[0.3em] text-slate-400">Swing Journal</p><h1 className="text-xl font-bold">Trader OS</h1></div></div></div>
        <nav className="space-y-2">{[["dashboard", LayoutDashboard, "Dashboard"],["trades", ListChecks, "Trade Log"],["analytics", LineChartIcon, "Analytics"],["risk", ShieldAlert, "Risk Manager"],["playbook", Target, "Playbook"],["psychology", Sparkles, "Psychology"],["reports", Download, "Reports"]].map(([key, Icon, label]) => <button key={key} onClick={() => setTab(key)} className={cn("flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition", tab === key ? "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/20" : "text-slate-300 hover:bg-white/5")}><Icon className="h-4 w-4" /><span className="text-sm font-medium">{label}</span></button>)}</nav>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs uppercase tracking-wider text-slate-400">Session Controls</p><div className="mt-3 flex items-center justify-between rounded-xl bg-black/20 px-3 py-2"><span className="text-sm">Theme</span><button onClick={() => setDark(v => !v)} className="rounded-full bg-white/10 p-2 hover:bg-white/20">{dark ? <MoonStar className="h-4 w-4" /> : <SunMedium className="h-4 w-4" />}</button></div><p className="mt-3 text-xs leading-5 text-slate-400">Yahoo Finance LTP refreshes every 60 seconds for open trades.</p></div>
      </aside>

      <main className="min-w-0 flex-1 space-y-5">
        <header className="rounded-3xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-black/20 backdrop-blur">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="text-xs uppercase tracking-[0.35em] text-slate-400">Professional Swing Trading Journal</p><h2 className="mt-2 text-2xl font-bold md:text-3xl">Track trades, live LTP, execution, and edge.</h2></div><div className="flex flex-wrap items-center gap-3"><div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search symbol, setup, sector..." className="w-56 bg-transparent text-sm outline-none placeholder:text-slate-500" /></div><button onClick={refreshQuotes} className="inline-flex items-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-white/5"><RefreshCw className={cn("h-4 w-4", quoteLoading && "animate-spin")} /> Refresh LTP</button><button onClick={() => setShowForm(v => !v)} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-400"><CirclePlus className="h-4 w-4" /> Add Trade</button></div></div>
        </header>

        {showForm && <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><SectionTitle icon={Plus} title="Add New Trade" subtitle="For Indian stocks, enter RELIANCE or RELIANCE.NS. For BSE use .BO. For US use ticker like AAPL." /><form onSubmit={handleAddTrade} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{[["Symbol","symbol"],["Sector","sector"],["Entry Date","entryDate","date"],["Exit Date","exitDate","date"],["Entry","entry","number"],["Exit","exit","number"],["Stop","stop","number"],["Qty","qty","number"],["R:R","rr","number"],["Holding Days","holdingDays","number"],["Discipline","discipline","number"],["Mistake","mistake"]].map(([label,key,type="text"]) => <label key={key} className="space-y-2"><span className="text-sm text-slate-300">{label}</span><input type={type} value={newTrade[key]} onChange={e => setNewTrade(p => ({...p, [key]: e.target.value}))} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none focus:border-cyan-500/40" /></label>)}<label className="space-y-2"><span className="text-sm text-slate-300">Setup</span><select value={newTrade.setup} onChange={e => setNewTrade(p => ({...p, setup: e.target.value}))} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none">{Object.keys(setupColors).map(s => <option key={s}>{s}</option>)}</select></label><label className="space-y-2"><span className="text-sm text-slate-300">Direction</span><select value={newTrade.direction} onChange={e => setNewTrade(p => ({...p, direction: e.target.value}))} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none"><option>Long</option><option>Short</option></select></label><label className="space-y-2"><span className="text-sm text-slate-300">Status</span><select value={newTrade.status} onChange={e => setNewTrade(p => ({...p, status: e.target.value}))} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none"><option>Planned</option><option>Open</option><option>Closed</option></select></label><label className="space-y-2 md:col-span-2 xl:col-span-4"><span className="text-sm text-slate-300">Notes</span><textarea value={newTrade.notes} onChange={e => setNewTrade(p => ({...p, notes: e.target.value}))} rows="3" className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm outline-none" /></label><div className="md:col-span-2 xl:col-span-4 flex items-center justify-end gap-3"><button type="button" onClick={() => setShowForm(false)} className="rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-300 hover:bg-white/5">Cancel</button><button type="submit" className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400">Save Trade</button></div></form></section>}

        {tab === "dashboard" && <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><MetricCard title="Closed Net P&L" value={fmtMoney(metrics.totalPnl)} sub={`${metrics.closedCount} closed trades`} icon={TrendingUp} positive={metrics.totalPnl >= 0} /><MetricCard title="Live Open P&L" value={fmtMoney(liveOpenPnl)} sub={`${metrics.openCount} open trades`} icon={Wifi} positive={liveOpenPnl >= 0} /><MetricCard title="Win Rate" value={toPct(metrics.winRate)} sub="Closed trades only" icon={Goal} positive={metrics.winRate >= 50} /><MetricCard title="Profit Factor" value={metrics.profitFactor.toFixed(2)} sub="Gross profit / gross loss" icon={Activity} positive={metrics.profitFactor >= 1} /><MetricCard title="Expectancy" value={fmtMoney(metrics.expectancy)} sub="Average per closed trade" icon={Target} positive={metrics.expectancy >= 0} /></div>
          <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><SectionTitle icon={Wifi} title="Live LTP Monitor - Yahoo Finance" subtitle="Uses Yahoo Finance chart endpoint. Refreshes every 60 seconds; click Refresh LTP for manual update." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{trades.filter(t => t.status === "Open").map(t => { const q = quotes[normalizeYahooSymbol(t.symbol)]; const pnl = livePnlForTrade(t, q); const chg = q?.ltp && q?.previousClose ? ((q.ltp - q.previousClose) / q.previousClose) * 100 : 0; return <div key={t.id} className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-start justify-between"><div><p className="text-lg font-semibold text-white">{normalizeYahooSymbol(t.symbol)}</p><p className="text-xs text-slate-400">{q?.exchangeName || "Yahoo Finance"} • {q?.marketState || "—"}</p></div>{q?.error ? <WifiOff className="h-5 w-5 text-rose-400" /> : <Wifi className="h-5 w-5 text-emerald-400" />}</div><div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-400">LTP</p><p className="text-xl font-semibold text-white">{q?.ltp ? `₹${fmtNum(q.ltp)}` : "—"}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-400">Day %</p><p className={cn("text-xl font-semibold", chg >= 0 ? "text-emerald-400" : "text-rose-400")}>{q?.ltp ? toPct(chg) : "—"}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-400">Live P&L</p><p className={cn("text-xl font-semibold", pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>{q?.ltp ? fmtMoney(pnl) : "—"}</p></div><div className="rounded-xl bg-black/20 p-3"><p className="text-slate-400">Updated</p><p className="text-white">{q?.fetchedAt || "—"}</p></div></div>{q?.error ? <p className="mt-3 text-xs text-rose-300">Error: {q.error}. If GitHub Pages blocks direct Yahoo access, the app tries a public CORS proxy automatically.</p> : null}</div> })}</div></section>
          <div className="grid gap-5 xl:grid-cols-3"><div className="xl:col-span-2 rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><SectionTitle icon={LineChartIcon} title="Equity Curve" subtitle="Track equity growth by closed trade." /><div className="h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={equityData}><CartesianGrid strokeDasharray="3 3" opacity={0.18} /><XAxis dataKey="name" /><YAxis /><Tooltip /><Area type="monotone" dataKey="equity" strokeWidth={2} fillOpacity={0.25} fill="#22c55e" stroke="#22c55e" /></AreaChart></ResponsiveContainer></div></div><div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><SectionTitle icon={WalletCards} title="Performance Mix" subtitle="Closed trade distribution by setup." /><div className="h-80"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={setupData.length ? setupData : [{ setup: "No data", pnl: 1 }]} dataKey="pnl" nameKey="setup" outerRadius={110} innerRadius={60} label>{(setupData.length ? setupData : [{ setup: "No data" }]).map((entry, index) => <Cell key={index} fill={Object.values(setupColors)[index % Object.values(setupColors).length]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></div></div></div>
        </div>}

        {tab === "trades" && <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><SectionTitle icon={ListChecks} title="Trade Log" subtitle="Includes live LTP and live P&L for open trades." /><div className="flex flex-wrap items-center gap-3"><div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"><Filter className="h-4 w-4 text-slate-400" /><select value={setupFilter} onChange={e => setSetupFilter(e.target.value)} className="bg-transparent text-sm outline-none"><option>All</option>{Object.keys(setupColors).map(s => <option key={s}>{s}</option>)}</select></div><div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2"><SlidersHorizontal className="h-4 w-4 text-slate-400" /><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-transparent text-sm outline-none"><option>All</option><option>Planned</option><option>Open</option><option>Closed</option></select></div></div></div><div className="mt-4 overflow-hidden rounded-2xl border border-white/10"><div className="overflow-x-auto"><table className="min-w-full divide-y divide-white/10 text-sm"><thead className="bg-white/5 text-slate-300"><tr>{"Symbol Setup Dir Entry LTP Exit Qty P&L RR Hold Status Actions".split(" ").map(h => <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}</tr></thead><tbody className="divide-y divide-white/10">{filteredTrades.map(t => { const q = quotes[normalizeYahooSymbol(t.symbol)]; const pnl = t.status === "Open" ? livePnlForTrade(t, q) : t.pnl; return <tr key={t.id} className="hover:bg-white/5"><td className="px-4 py-3 font-semibold text-white">{t.symbol}</td><td className="px-4 py-3"><span className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium" style={{ background: `${setupColors[t.setup] || "#64748b"}22`, color: setupColors[t.setup] || "#cbd5e1" }}>{t.setup}</span></td><td className="px-4 py-3">{t.direction}</td><td className="px-4 py-3">₹{fmtNum(t.entry)}</td><td className="px-4 py-3">{t.status === "Open" ? (q?.ltp ? `₹${fmtNum(q.ltp)}` : "—") : "—"}</td><td className="px-4 py-3">{t.exit ? `₹${fmtNum(t.exit)}` : "—"}</td><td className="px-4 py-3">{fmtNum(t.qty)}</td><td className={cn("px-4 py-3 font-medium", pnl >= 0 ? "text-emerald-400" : "text-rose-400")}>{t.status === "Planned" ? "—" : fmtMoney(pnl)}</td><td className="px-4 py-3">{Number(t.rr || 0).toFixed(2)}</td><td className="px-4 py-3">{t.holdingDays || "—"}</td><td className="px-4 py-3">{t.status}</td><td className="px-4 py-3"><button onClick={() => deleteTrade(t.id)} className="inline-flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-slate-300 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="h-4 w-4" /> Delete</button></td></tr>})}</tbody></table></div></div></section>}

        {tab === "analytics" && <div className="grid gap-5 xl:grid-cols-2"><section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><SectionTitle icon={LineChartIcon} title="Monthly P&L" subtitle="Closed trade P&L by month." /><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={monthlyData}><CartesianGrid strokeDasharray="3 3" opacity={0.18} /><XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="pnl" fill="#22c55e" radius={[10,10,0,0]} /></BarChart></ResponsiveContainer></div></section><section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><SectionTitle icon={Sparkles} title="Setup Performance" subtitle="Which setups are producing returns?" /><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={setupData}><CartesianGrid strokeDasharray="3 3" opacity={0.18} /><XAxis dataKey="setup" /><YAxis /><Tooltip /><Bar dataKey="pnl" radius={[10,10,0,0]}>{setupData.map((entry,index) => <Cell key={index} fill={Object.values(setupColors)[index % Object.values(setupColors).length]} />)}</Bar></BarChart></ResponsiveContainer></div></section></div>}

        {tab === "risk" && <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><SectionTitle icon={ShieldAlert} title="Risk Manager" subtitle="Live open P&L is included in risk view." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><MetricCard title="Capital" value="₹10,00,000" sub="Example starting capital" icon={WalletCards} /><MetricCard title="Max Risk / Trade" value="1.0%" sub="₹10,000 per trade" icon={Target} /><MetricCard title="Open Risk" value={fmtMoney(trades.filter(t=>t.status==='Open').reduce((s,t)=>s+(t.risk||0),0))} sub="Across open positions" icon={ShieldAlert} positive={false} /><MetricCard title="Live Open P&L" value={fmtMoney(liveOpenPnl)} sub="Yahoo Finance LTP" icon={CheckCircle2} positive={liveOpenPnl >= 0} /></div></section>}

        {tab === "playbook" && <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><SectionTitle icon={Target} title="Strategy Playbook" subtitle="Document your best swing setups." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[["Breakout","Strong trend, volume expansion, clean base."],["Pullback","Buy strength after controlled retrace."],["Retest","Breakout retest with risk defined."]].map(([name,desc]) => <div key={name} className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center justify-between"><h3 className="font-semibold text-white">{name}</h3><Tag className="h-4 w-4 text-slate-400" /></div><p className="mt-2 text-sm text-slate-300">{desc}</p></div>)}</div></section>}

        {tab === "psychology" && <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><SectionTitle icon={Sparkles} title="Psychology Journal" subtitle="Track mood, discipline, and behavior patterns." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><MetricCard title="Avg Discipline" value={`${(trades.reduce((s,t)=>s+t.discipline,0)/trades.length).toFixed(1)}/10`} sub="Self-rated execution" icon={ListChecks} /><MetricCard title="Calm Days" value={trades.filter(t=>t.mood==='Calm').length.toString()} sub="Better decisions calm" icon={MoonStar} /><MetricCard title="Reviewed Trades" value={trades.filter(t=>t.reviewed).length.toString()} sub="Post-trade learning" icon={CheckCircle2} /><MetricCard title="Mistakes Tagged" value={trades.filter(t=>t.mistake).length.toString()} sub="Patterns to eliminate" icon={ShieldAlert} positive={false} /></div></section>}

        {tab === "reports" && <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-2xl shadow-black/20 backdrop-blur"><SectionTitle icon={Download} title="Reports" subtitle="Export-ready summary views." /><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{["Weekly Trading Report","Monthly Trading Report","Strategy Performance Report","Mistake Analysis Report","Psychology Review","Risk Exposure Summary"].map(item => <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4"><div className="flex items-center justify-between"><p className="font-medium text-white">{item}</p><Download className="h-4 w-4 text-slate-400" /></div><p className="mt-2 text-sm text-slate-400">PDF / CSV-ready layout with charts, notes, and trade summary.</p></div>)}</div></section>}
      </main>
    </div>
  </div>;
}
