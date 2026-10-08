/* =========================================================
   TWO-SIDED ELITE SCALPER — DATA ENGINE v2
   Fetches Twelve Data + runs scalper engine + updates UI
   ========================================================= */

"use strict";

/* =========================================================
   CONFIG
   ========================================================= */
const TWELVE_DATA_API_KEY = "53821bf38bec40e4a88bd1fa06ac32b3";
const SYMBOL = "EUR/USD";
const REFRESH_INTERVAL = 60000;
const CANDLE_LIMIT = 220;

const TSConfig = {
    SL_PIPS: 15,
    TP_PIPS: 10,
    PIP: 0.0001,
    TIMEOUT_MIN: 180,
    COOLDOWN_MIN: 120,
    MAX_TRADES_PER_DAY: 6,
    EMA_PERIOD: 50,
    RSI_PERIOD: 14,
    RSI_SELL_BLOCK: 25,
    RSI_BUY_BLOCK: 75,
    RSI_REVERSAL_BUY: 35,
    RSI_REVERSAL_SELL: 65,
    SWEEP_LOOKBACK: 20,
    NEWS_BLOCKER: true,
    NEWS_BLOCK_MINUTES: 10
};

const NEWS_API_BASE = "https://biquote.io/api/calendar";
const NEWS_COUNTRIES = "US,EU";
const NEWS_IMPORTANCE = "high";

/* =========================================================
   DATA ENGINE STATE
   ========================================================= */
const DataEngine = {
    pair: SYMBOL,
    connected: false,
    lastUpdate: null,
    livePrice: null,
    candles: { H4: [], H1: [], M30: [], M15: [], M5: [] },
    status: { H4: "WAITING", H1: "WAITING", M30: "WAITING", M15: "WAITING", M5: "WAITING", price: "WAITING" }
};

let loadingMarketData = false;

/* =========================================================
   NEWS STATE
   ========================================================= */
let newsData = {
    connected: false,
    events: [],
    lastUpdated: null,
    blocked: false,
    blockingEvent: null,
    nextEUR: null,
    nextUSD: null,
    error: null
};

/* =========================================================
   TRADE STATE (localStorage)
   ========================================================= */
const STATE_KEY = "twosided_state_v1";

let tradeState = {
    openTrade: null,
    lastTradeTime: null,
    tradesToday: 0,
    currentDay: null,
    lastOutcome: null,
    history: []
};

function loadState() {
    try {
        const raw = localStorage.getItem(STATE_KEY);
        if (raw) tradeState = Object.assign(tradeState, JSON.parse(raw));
    } catch (e) { console.warn("State load failed:", e); }
}

function saveState() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(tradeState)); }
    catch (e) { console.warn("State save failed:", e); }
}

function todayStr() { return new Date().toISOString().slice(0, 10); }

function resetDayIfNeeded() {
    const today = todayStr();
    if (tradeState.currentDay !== today) {
        tradeState.currentDay = today;
        tradeState.tradesToday = 0;
        tradeState.lastTradeTime = null;
        saveState();
    }
}

/* =========================================================
   DOM HELPERS
   ========================================================= */
function getElement(id) { return document.getElementById(id); }

function setText(id, value) {
    const el = getElement(id);
    if (el) el.textContent = value;
}

function setManyText(ids, value) { ids.forEach(id => setText(id, value)); }

function formatPrice(v) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(5) : "—";
}

function formatNumber(v, d = 2) {
    if (v === null || v === undefined) return "—";
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(d) : "—";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* =========================================================
   CLOCK + SESSION
   ========================================================= */
function updateIndiaTime() {
    const india = new Intl.DateTimeFormat("en-IN", {
        timeZone: "Asia/Kolkata",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false
    }).format(new Date());
    setManyText(["indiaTime", "india-time", "clock"], india);
    updateTradingSession();
}

function getTradingSession() {
    const now = new Date();
    const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const london = minutes >= 420 && minutes < 960;
    const newYork = minutes >= 720 && minutes < 1260;
    const asia = minutes >= 0 && minutes < 480;
    const sydney = minutes >= 1260 || minutes < 360;
    if (london && newYork) return { name: "LONDON + NY", active: true };
    if (london) return { name: "LONDON", active: true };
    if (newYork) return { name: "NEW YORK", active: true };
    if (asia) return { name: "ASIA", active: true };
    if (sydney) return { name: "SYDNEY", active: true };
    return { name: "OFF SESSION", active: false };
}

function updateTradingSession() {
    const s = getTradingSession();
    setManyText(["session", "tradingSession", "currentSession"], s.name);
}

/* =========================================================
   TWELVE DATA PROVIDER
   ========================================================= */
async function twelveData(endpoint, params = {}) {
    const url = new URL("https://api.twelvedata.com/" + endpoint);
    url.searchParams.set("apikey", TWELVE_DATA_API_KEY);
    Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));
    const r = await fetch(url.toString(), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = await r.json();
    if (data.status === "error") throw new Error(data.message || "Twelve Data error");
    return data;
}

async function fetchLivePrice() {
    try {
        const data = await twelveData("price", { symbol: SYMBOL });
        const price = Number(data.price);
        if (!Number.isFinite(price)) throw new Error("Invalid price");
        DataEngine.livePrice = price;
        DataEngine.status.price = "READY";
        DataEngine.lastUpdate = Date.now();
        setManyText(["price", "livePrice", "currentPrice", "riskLivePrice", "riskEntry", "entryPrice"],
            formatPrice(price));
        return price;
    } catch (e) {
        console.error("Live price error:", e);
        if (DataEngine.livePrice !== null) {
            setManyText(["price", "livePrice", "currentPrice"], formatPrice(DataEngine.livePrice));
        }
        return DataEngine.livePrice;
    }
}

async function fetchCandles(interval) {
    try {
        const data = await twelveData("time_series", {
            symbol: SYMBOL, interval: interval,
            outputsize: CANDLE_LIMIT, timezone: "UTC", order: "ASC"
        });
        if (!data.values || !Array.isArray(data.values)) throw new Error("No values");
        return data.values.map(c => ({
            time: Math.floor(new Date(c.datetime).getTime() / 1000),
            open: Number(c.open), high: Number(c.high),
            low: Number(c.low), close: Number(c.close),
            volume: Number(c.volume || 0)
        })).filter(c =>
            Number.isFinite(c.open) && Number.isFinite(c.high) &&
            Number.isFinite(c.low) && Number.isFinite(c.close)
        );
    } catch (e) {
        console.error(interval + " fetch error:", e);
        return [];
    }
}

function resampleM30(m15) {
    if (!m15 || m15.length < 2) return [];
    const out = [];
    for (let i = 0; i < m15.length - 1; i += 2) {
        const a = m15[i], b = m15[i + 1];
        out.push({
            time: a.time, open: a.open,
            high: Math.max(a.high, b.high),
            low: Math.min(a.low, b.low),
            close: b.close, volume: (a.volume || 0) + (b.volume || 0)
        });
    }
    return out;
}

async function loadAllCandles() {
    DataEngine.candles.H4  = await fetchCandles("4h");   await sleep(1200);
    DataEngine.candles.H1  = await fetchCandles("1h");   await sleep(1200);
    DataEngine.candles.M15 = await fetchCandles("15min");await sleep(1200);
    DataEngine.candles.M5  = await fetchCandles("5min");
    DataEngine.candles.M30 = resampleM30(DataEngine.candles.M15);
}

/* =========================================================
   INDICATORS
   ========================================================= */
function getCloses(c) { return c.map(x => Number(x.close)); }

function calculateEMA(values, period) {
    if (!values || values.length < period) return null;
    const mult = 2 / (period + 1);
    let ema = 0;
    for (let i = 0; i < period; i++) ema += Number(values[i]);
    ema /= period;
    for (let i = period; i < values.length; i++)
        ema = (Number(values[i]) - ema) * mult + ema;
    return ema;
}

function calculateRSI(candles, period = 14) {
    if (!candles || candles.length <= period) return null;
    const closes = getCloses(candles);
    let g = 0, l = 0;
    for (let i = 1; i <= period; i++) {
        const d = closes[i] - closes[i - 1];
        if (d > 0) g += d; else l += Math.abs(d);
    }
    let ag = g / period, al = l / period;
    for (let i = period + 1; i < closes.length; i++) {
        const d = closes[i] - closes[i - 1];
        ag = ((ag * (period - 1)) + (d > 0 ? d : 0)) / period;
        al = ((al * (period - 1)) + (d < 0 ? Math.abs(d) : 0)) / period;
    }
    if (al === 0) return 100;
    return 100 - (100 / (1 + ag / al));
}

/* =========================================================
   HTF BIAS — H4 + H1 + M30 EMA50
   ========================================================= */
function getTimeframeBias(candles) {
    if (!candles || candles.length < TSConfig.EMA_PERIOD + 5) return "RANGE";
    const ema = calculateEMA(getCloses(candles), TSConfig.EMA_PERIOD);
    if (ema === null) return "RANGE";
    const last = candles[candles.length - 1].close;
    if (last > ema) return "BULL";
    if (last < ema) return "BEAR";
    return "RANGE";
}

function getHTFBias() {
    const h4  = getTimeframeBias(DataEngine.candles.H4);
    const h1  = getTimeframeBias(DataEngine.candles.H1);
    const m30 = getTimeframeBias(DataEngine.candles.M30);
    let bias = "RANGE";
    if (h4 === "BEAR" && h1 === "BEAR" && m30 === "BEAR") bias = "SELL_PREFERRED";
    else if (h4 === "BULL" && h1 === "BULL" && m30 === "BULL") bias = "BUY_PREFERRED";
    return { bias, h4, h1, m30 };
}

/* =========================================================
   M5 STRUCTURE BREAK
   ========================================================= */
function getM5Break() {
    const m5 = DataEngine.candles.M5;
    if (!m5 || m5.length < 3) return { direction: null, reason: "NO_DATA" };
    const last = m5[m5.length - 1];
    const prior = m5[m5.length - 2];
    if (last.close < prior.low) return { direction: "SELL", reason: "M5_BREAK_LOW" };
    if (last.close > prior.high) return { direction: "BUY", reason: "M5_BREAK_HIGH" };
    return { direction: null, reason: "NO_STRUCTURE_BREAK" };
}

/* =========================================================
   M15 CHoCH
   ========================================================= */
function getM15CHoCH() {
    const m15 = DataEngine.candles.M15;
    if (!m15 || m15.length < 3) return null;
    const last = m15[m15.length - 1];
    const prior = m15[m15.length - 2];
    if (last.close > prior.high) return "BULL";
    if (last.close < prior.low) return "BEAR";
    return null;
}

/* =========================================================
   SWEEP CHECK
   ========================================================= */
function checkSweep(direction) {
    const m5 = DataEngine.candles.M5;
    if (!m5 || m5.length < 22) return false;
    const recent = m5.slice(-(TSConfig.SWEEP_LOOKBACK + 2), -1);
    const last = m5[m5.length - 1];
    if (direction === "BUY") {
        const low = Math.min(...recent.map(c => c.low));
        return last.low < low;
    }
    if (direction === "SELL") {
        const high = Math.max(...recent.map(c => c.high));
        return last.high > high;
    }
    return false;
}

/* =========================================================
   ENTRY DECISION
   ========================================================= */
function evaluateEntry() {
    const m5 = DataEngine.candles.M5;
    if (!m5 || m5.length < 60) {
        return { signal: null, direction: null, reason: "INSUFFICIENT_DATA", bias: "RANGE" };
    }
    const rsi = calculateRSI(m5, TSConfig.RSI_PERIOD);
    const { bias, h4, h1, m30 } = getHTFBias();
    const { direction, reason } = getM5Break();
    const out = { signal: null, direction, bias, rsi, h4Trend: h4, h1Trend: h1, m30Trend: m30, reason };

    if (!direction) return out;

    if (bias === "SELL_PREFERRED" && direction === "SELL") {
        if (rsi !== null && rsi > TSConfig.RSI_SELL_BLOCK) {
            out.signal = "SELL"; out.reason = "TREND_CONT_SELL"; return out;
        }
        out.reason = "RSI_SELL_BLOCK"; return out;
    }
    if (bias === "BUY_PREFERRED" && direction === "BUY") {
        if (rsi !== null && rsi < TSConfig.RSI_BUY_BLOCK) {
            out.signal = "BUY"; out.reason = "TREND_CONT_BUY"; return out;
        }
        out.reason = "RSI_BUY_BLOCK"; return out;
    }
    if (bias === "SELL_PREFERRED" && direction === "BUY") {
        const swept = checkSweep("BUY");
        const choch = getM15CHoCH();
        if (swept && choch === "BULL" && rsi !== null && rsi < TSConfig.RSI_REVERSAL_BUY) {
            out.signal = "BUY"; out.reason = "REVERSAL_BUY"; return out;
        }
        out.reason = "BLOCKED_NO_REVERSAL"; return out;
    }
    if (bias === "BUY_PREFERRED" && direction === "SELL") {
        const swept = checkSweep("SELL");
        const choch = getM15CHoCH();
        if (swept && choch === "BEAR" && rsi !== null && rsi > TSConfig.RSI_REVERSAL_SELL) {
            out.signal = "SELL"; out.reason = "REVERSAL_SELL"; return out;
        }
        out.reason = "BLOCKED_NO_REVERSAL"; return out;
    }
    out.reason = "BLOCKED_HTF_RANGE";
    return out;
}

/* =========================================================
   NEWS
   ========================================================= */
async function fetchEconomicCalendar() {
    try {
        const now = new Date();
        const from = new Date(now.getTime() - 24 * 3600 * 1000);
        const to = new Date(now.getTime() + 7 * 24 * 3600 * 1000);
        const url = new URL(NEWS_API_BASE);
        url.searchParams.set("countries", NEWS_COUNTRIES);
        url.searchParams.set("importance", NEWS_IMPORTANCE);
        url.searchParams.set("from", from.toISOString());
        url.searchParams.set("to", to.toISOString());
        url.searchParams.set("limit", "200");
        const r = await fetch(url.toString(), { cache: "no-store" });
        if (!r.ok) throw new Error("News HTTP " + r.status);
        const events = await r.json();
        if (!Array.isArray(events)) throw new Error("Invalid calendar");

        newsData.events = events.filter(e => e && (
            e.currency === "EUR" || e.currency === "USD" ||
            e.countryCode === "EU" || e.countryCode === "US"
        )).sort((a, b) => new Date(a.time) - new Date(b.time));

        newsData.connected = true;
        newsData.error = null;
        newsData.lastUpdated = new Date();
        newsData.nextEUR = getNextNewsEvent("EUR");
        newsData.nextUSD = getNextNewsEvent("USD");
        const b = getCurrentNewsBlocker();
        newsData.blocked = b.blocked;
        newsData.blockingEvent = b.event;
        updateNewsDisplay();
    } catch (e) {
        console.error("Calendar error:", e);
        newsData.connected = false;
        newsData.error = e.message;
        newsData.blocked = true;
        updateNewsDisplay();
    }
}

function getEventCurrency(e) {
    if (!e) return null;
    if (e.currency === "EUR" || e.currency === "USD") return e.currency;
    if (e.countryCode === "EU") return "EUR";
    if (e.countryCode === "US") return "USD";
    return null;
}

function getNextNewsEvent(currency) {
    const now = Date.now();
    return newsData.events.filter(e => {
        const c = getEventCurrency(e);
        const t = new Date(e.time).getTime();
        return c === currency && Number.isFinite(t) && t >= now;
    }).sort((a, b) => new Date(a.time) - new Date(b.time))[0] || null;
}

function getCurrentNewsBlocker() {
    if (!newsData.connected) return { blocked: true, event: null };
    const now = Date.now();
    const w = TSConfig.NEWS_BLOCK_MINUTES * 60 * 1000;
    const blocking = newsData.events.filter(e => {
        const c = getEventCurrency(e);
        if (c !== "EUR" && c !== "USD") return false;
        const t = new Date(e.time).getTime();
        if (!Number.isFinite(t)) return false;
        return Math.abs(now - t) <= w;
    }).sort((a, b) =>
        Math.abs(new Date(a.time) - now) - Math.abs(new Date(b.time) - now));
    return blocking.length ? { blocked: true, event: blocking[0] } : { blocked: false, event: null };
}

function formatNewsEvent(e) {
    if (!e) return "NONE";
    const cur = getEventCurrency(e) || "—";
    const t = new Date(e.time);
    if (Number.isNaN(t.getTime())) return cur + " • " + (e.name || "Event");
    const india = t.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit", hour12: false
    });
    return cur + " • " + (e.name || "Event") + " • " + india + " IST";
}

function evaluateNewsBlocker() {
    if (!TSConfig.NEWS_BLOCKER) return { valid: true, status: "CLEAR", reason: "News disabled" };
    if (!newsData.connected) return { valid: false, status: "NEWS NOT CONFIRMED", reason: "Calendar unavailable" };
    const b = getCurrentNewsBlocker();
    if (b.blocked) return {
        valid: false, status: "NEWS BLOCKED",
        reason: b.event ? formatNewsEvent(b.event) : "High-impact window active",
        event: b.event
    };
    return { valid: true, status: "NEWS CLEAR", reason: "No high-impact within ±10min" };
}

function updateNewsDisplay() {
    if (!newsData.connected) {
        setManyText(["economicCalendar", "newsStatus", "calendarStatus"], "NOT CONFIRMED");
        setManyText(["eurEvents"], "NOT CONFIRMED");
        setManyText(["usdEvents"], "NOT CONFIRMED");
        setManyText(["newsBlocker"], "BLOCKED");
        return;
    }
    setManyText(["eurEvents"], formatNewsEvent(newsData.nextEUR));
    setManyText(["usdEvents"], formatNewsEvent(newsData.nextUSD));
    const b = evaluateNewsBlocker();
    setManyText(["economicCalendar", "newsStatus", "calendarStatus"], b.status);
    setManyText(["newsBlocker"], b.status);
}

/* =========================================================
   TRADE LIFECYCLE
   ========================================================= */
function canOpenNewTrade() {
    resetDayIfNeeded();
    if (tradeState.openTrade !== null) return { ok: false, reason: "TRADE_ALREADY_OPEN" };
    if (tradeState.tradesToday >= TSConfig.MAX_TRADES_PER_DAY)
        return { ok: false, reason: "MAX_TRADES_PER_DAY REACHED" };
    if (tradeState.lastTradeTime) {
        const el = (Date.now() - new Date(tradeState.lastTradeTime).getTime()) / 60000;
        if (el < TSConfig.COOLDOWN_MIN)
            return { ok: false, reason: "COOLDOWN (" + Math.ceil(TSConfig.COOLDOWN_MIN - el) + " min left)" };
    }
    return { ok: true, reason: "OK" };
}

function openTrade(side, entry, reason) {
    const pip = TSConfig.PIP;
    const sl = side === "BUY" ? entry - TSConfig.SL_PIPS * pip : entry + TSConfig.SL_PIPS * pip;
    const tp = side === "BUY" ? entry + TSConfig.TP_PIPS * pip : entry - TSConfig.TP_PIPS * pip;
    tradeState.openTrade = {
        side,
        entry: Number(entry.toFixed(5)),
        sl: Number(sl.toFixed(5)),
        tp: Number(tp.toFixed(5)),
        reason,
        openedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + TSConfig.TIMEOUT_MIN * 60000).toISOString()
    };
    saveState();
}

function updateOpenTrade(price) {
    const t = tradeState.openTrade;
    if (!t || !Number.isFinite(price)) return null;
    let outcome = null;
    if (t.side === "BUY") {
        if (price <= t.sl) outcome = "loss";
        else if (price >= t.tp) outcome = "win";
    } else {
        if (price >= t.sl) outcome = "loss";
        else if (price <= t.tp) outcome = "win";
    }
    if (!outcome && Date.now() >= new Date(t.expiresAt).getTime()) outcome = "timeout";
    if (outcome) {
        tradeState.history.push({ ...t, outcome, closedAt: new Date().toISOString() });
        tradeState.history = tradeState.history.slice(-200);
        tradeState.openTrade = null;
        tradeState.lastTradeTime = new Date().toISOString();
        tradeState.tradesToday = (tradeState.tradesToday || 0) + 1;
        tradeState.lastOutcome = outcome;
        saveState();
        return outcome;
    }
    return null;
}

function getStats() {
    const hist = tradeState.history || [];
    const wins = hist.filter(t => t.outcome === "win").length;
    const losses = hist.filter(t => t.outcome === "loss").length;
    const timeouts = hist.filter(t => t.outcome === "timeout").length;
    const netPips = hist.reduce((s, t) => {
        if (t.outcome === "win") return s + TSConfig.TP_PIPS;
        if (t.outcome === "loss") return s - TSConfig.SL_PIPS;
        return s;
    }, 0);
    const wr = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : null;
    return { wins, losses, timeouts, total: hist.length, netPips, winRate: wr };
}

/* =========================================================
   UI DISPLAY
   ========================================================= */
function updateBiasDisplay(biasData) {
    setManyText(["bias", "biasMain"], biasData.bias);
    const tclass = t => t === "BULL" ? "bull" : t === "BEAR" ? "bear" : "range";
    ["h4", "h1", "m30"].forEach(tf => {
        const el = getElement(tf);
        if (el) {
            el.textContent = tf.toUpperCase() + " " + biasData[tf];
            el.className = "pill " + tclass(biasData[tf]);
        }
    });
}

function updateSignalDisplay(entry, canOpen) {
    const sc = getElement("signal-card");
    const sig = getElement("signal");
    const reason = getElement("signal_reason");
    if (entry.signal === "BUY") {
        if (sc) sc.className = "signal-card firing";
        if (sig) sig.textContent = "🔥 BUY";
    } else if (entry.signal === "SELL") {
        if (sc) sc.className = "signal-card firing-sell";
        if (sig) sig.textContent = "🔥 SELL";
    } else if (entry.direction) {
        if (sc) sc.className = "signal-card waiting";
        if (sig) sig.textContent = "🟡 " + entry.direction + " blocked";
    } else {
        if (sc) sc.className = "signal-card waiting";
        if (sig) sig.textContent = "🟡 WAITING";
    }
    if (reason) {
        const co = canOpen.reason !== "OK" ? " • " + canOpen.reason : "";
        reason.textContent = (entry.reason || "—") + co;
    }
}

function updateStatsDisplay() {
    const s = getStats();
    setText("s_wins", s.wins);
    setText("s_losses", s.losses);
    setText("s_timeouts", s.timeouts);
    setText("s_wr", s.winRate !== null ? s.winRate.toFixed(1) + "%" : "--");
    setText("s_total", s.total + " trades");
    const p = getElement("s_pips");
    if (p) {
        p.textContent = (s.netPips >= 0 ? "+" : "") + s.netPips;
        p.style.color = s.netPips > 0 ? "#00e59a" : s.netPips < 0 ? "#ff405d" : "#edf8ff";
    }
    setText("trades_today", (tradeState.tradesToday || 0) + " / " + TSConfig.MAX_TRADES_PER_DAY);
    setText("last_outcome", tradeState.lastOutcome || "--");
    setText("cooldown", TSConfig.COOLDOWN_MIN + " min");
    setText("timeout", TSConfig.TIMEOUT_MIN + " min");
}

function updateTradeCard() {
    const tc = getElement("trade_container");
    if (!tc) return;
    const t = tradeState.openTrade;
    if (!t) { tc.innerHTML = ""; return; }
    const cls = t.side === "BUY" ? "buy" : "sell";
    const opened = t.openedAt.split("T")[1].slice(0, 8);
    const expires = t.expiresAt.split("T")[1].slice(0, 8);
    tc.innerHTML = `<div class="trade-card ${cls}">
        <div class="h">🔒 OPEN — ${t.side} @ ${t.entry}</div>
        <div class="trade-row"><span class="k">SL</span><span class="v">${t.sl}</span></div>
        <div class="trade-row"><span class="k">TP</span><span class="v">${t.tp}</span></div>
        <div class="trade-row"><span class="k">Opened</span><span class="v">${opened}</span></div>
        <div class="trade-row"><span class="k">Expires</span><span class="v">${expires}</span></div>
        <div class="trade-row"><span class="k">Reason</span><span class="v">${t.reason}</span></div>
    </div>`;
}

function updateInternals(entry) {
    const rsi = getElement("rsi");
    if (rsi) rsi.textContent = entry.rsi !== null ? entry.rsi.toFixed(1) : "—";
    setManyText(["m5_break", "m5Break"], entry.direction ? entry.direction.toLowerCase() : "none");
    setText("lastUpdate", new Date().toLocaleTimeString("en-IN", { hour12: false }));
}

/* =========================================================
   MAIN REFRESH
   ========================================================= */
async function requestMarketData() {
    if (loadingMarketData) return;
    loadingMarketData = true;
    try {
        await fetchLivePrice();
        await loadAllCandles();

        // 1. Check open trade first
        if (tradeState.openTrade && DataEngine.livePrice !== null) {
            updateOpenTrade(DataEngine.livePrice);
        }

        // 2. Evaluate entry
        const entry = evaluateEntry();
        const canOpen = canOpenNewTrade();
        const news = evaluateNewsBlocker();

        // 3. Open trade if signal + cooldown clear + no news
        if (entry.signal && canOpen.ok && news.valid) {
            openTrade(entry.signal, DataEngine.livePrice, entry.reason);
        }

        // 4. Update UI
        updateBiasDisplay({ bias: entry.bias, h4: entry.h4Trend, h1: entry.h1Trend, m30: entry.m30Trend });
        updateSignalDisplay(entry, canOpen);
        updateStatsDisplay();
        updateTradeCard();
        updateInternals(entry);

        // 5. Fetch news
        await fetchEconomicCalendar();

        DataEngine.connected = true;
    } catch (e) {
        console.error("Refresh error:", e);
        DataEngine.connected = false;
    } finally {
        loadingMarketData = false;
    }
}

/* =========================================================
   START
   ========================================================= */
let dataEngineTimer = null;

function startDataEngine() {
    if (dataEngineTimer) clearInterval(dataEngineTimer);
    requestMarketData();
    dataEngineTimer = setInterval(requestMarketData, REFRESH_INTERVAL);
}

function stopDataEngine() {
    if (dataEngineTimer) { clearInterval(dataEngineTimer); dataEngineTimer = null; }
}

async function startDashboard() {
    loadState();
    resetDayIfNeeded();
    updateIndiaTime();
    setInterval(updateIndiaTime, 1000);
    startDataEngine();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startDashboard);
} else {
    startDashboard();
}

/* =========================================================
   GLOBAL DEBUG ACCESS
   ========================================================= */
window.DataEngine = DataEngine;
window.TwoSided = {
    state: tradeState,
    news: newsData,
    refresh: requestMarketData,
    getLivePrice: () => DataEngine.livePrice,
    evaluateEntry,
    getHTFBias,
    getStats,
    start: startDataEngine,
    stop: stopDataEngine,
    reset: () => {
        tradeState = { openTrade: null, lastTradeTime: null, tradesToday: 0, currentDay: null, lastOutcome: null, history: [] };
        saveState();
    }
};
window.startDataEngine = startDataEngine;
window.stopDataEngine = stopDataEngine;
