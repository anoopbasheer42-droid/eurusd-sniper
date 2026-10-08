/* =========================================================
   TWO-SIDED ELITE SCALPER
   EUR/USD — Client-Side Engine
   Twelve Data API + biquote News

   RULES (from 60-day backtest):
   - SL: 15 pips | TP: 10 pips
   - Timeout: 180 minutes
   - Cooldown: 120 minutes between trades
   - Max trades/day: 6
   - HTF bias: H4 + H1 + M30 EMA50 alignment
   - Entry: M5 close below prior low → SELL
            M5 close above prior high → BUY
   - RSI blockers: SELL if RSI<25, BUY if RSI>75
   - Reversal: sweep 20-low + M15 CHoCH + RSI<35 (BUY)
               sweep 20-high + M15 CHoCH + RSI>65 (SELL)
   ========================================================= */

const TWELVE_DATA_API_KEY = "53821bf38bec40e4a88bd1fa06ac32b3";
const SYMBOL = "EUR/USD";
const REFRESH_INTERVAL = 60000;
const CANDLE_LIMIT = 220;
const SWING_LOOKBACK = 2;

/* =========================================================
   TWO-SIDED SCALPER CONFIG
   ========================================================= */
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
   GLOBAL STATE
   ========================================================= */
let marketData = { H4: [], H1: [], M30: [], M15: [], M5: [] };
let livePrice = null;
let dashboardStarted = false;
let loadingMarketData = false;

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
   TRADE STATE (persisted to localStorage)
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
        if (!raw) return;
        const parsed = JSON.parse(raw);
        tradeState = Object.assign(tradeState, parsed);
    } catch (e) {
        console.warn("State load failed:", e);
    }
}

function saveState() {
    try {
        localStorage.setItem(STATE_KEY, JSON.stringify(tradeState));
    } catch (e) {
        console.warn("State save failed:", e);
    }
}

function todayStr() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
}

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
   BASIC HELPERS
   ========================================================= */
function getElement(id) { return document.getElementById(id); }

function setText(id, value) {
    const el = getElement(id);
    if (el) el.textContent = value;
}

function setManyText(ids, value) {
    ids.forEach(id => setText(id, value));
}

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

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

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

    if (london && newYork) return { name: "LONDON + NEW YORK", active: true };
    if (london) return { name: "LONDON", active: true };
    if (newYork) return { name: "NEW YORK", active: true };
    if (asia) return { name: "ASIA", active: true };
    if (sydney) return { name: "SYDNEY", active: true };
    return { name: "OFF SESSION", active: false };
}

function updateTradingSession() {
    const session = getTradingSession();
    setManyText(["session", "tradingSession", "currentSession"], session.name);
}

/* =========================================================
   TWELVE DATA
   ========================================================= */
async function twelveData(endpoint, params = {}) {
    const url = new URL("https://api.twelvedata.com/" + endpoint);
    url.searchParams.set("apikey", TWELVE_DATA_API_KEY);
    Object.keys(params).forEach(k => url.searchParams.set(k, params[k]));

    const response = await fetch(url.toString(), { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);

    const data = await response.json();
    if (data.status === "error") throw new Error(data.message || "Twelve Data error");
    return data;
}

async function fetchLivePrice() {
    try {
        const data = await twelveData("price", { symbol: SYMBOL });
        const price = Number(data.price);
        if (!Number.isFinite(price)) throw new Error("Invalid price");
        livePrice = price;
        setManyText([
            "price", "livePrice", "currentPrice", "chartPrice",
            "srCurrentPrice", "srCurrentPriceValue", "currentPriceValue",
            "livePriceValue", "riskLivePrice", "riskEntry", "entryPrice"
        ], formatPrice(price));
        setManyText(["priceStatus", "dataStatus"], "LIVE");
        return price;
    } catch (error) {
        console.error("Live price error:", error);
        if (livePrice !== null) {
            setManyText(["price", "livePrice", "currentPrice"],
                formatPrice(livePrice));
        }
        return livePrice;
    }
}

async function fetchCandles(interval) {
    try {
        const data = await twelveData("time_series", {
            symbol: SYMBOL,
            interval: interval,
            outputsize: CANDLE_LIMIT,
            timezone: "UTC",
            order: "ASC"
        });
        if (!data.values || !Array.isArray(data.values)) {
            throw new Error("No candle values returned");
        }
        return data.values.map(c => ({
            time: Math.floor(new Date(c.datetime).getTime() / 1000),
            open: Number(c.open), high: Number(c.high),
            low: Number(c.low), close: Number(c.close),
            volume: Number(c.volume || 0)
        })).filter(c =>
            Number.isFinite(c.open) && Number.isFinite(c.high) &&
            Number.isFinite(c.low) && Number.isFinite(c.close)
        );
    } catch (error) {
        console.error(interval + " candle error:", error);
        return [];
    }
}

async function loadAllCandles() {
    const results = {};
    results.H4 = await fetchCandles("4h"); await sleep(1200);
    results.H1 = await fetchCandles("1h"); await sleep(1200);
    results.M15 = await fetchCandles("15min"); await sleep(1200);
    results.M5 = await fetchCandles("5min");

    // Derive M30 by resampling M15 (pairs of M15 candles)
    results.M30 = resampleM30(results.M15);

    marketData.H4 = results.H4;
    marketData.H1 = results.H1;
    marketData.M30 = results.M30;
    marketData.M15 = results.M15;
    marketData.M5 = results.M5;
    return results;
}

function resampleM30(m15) {
    if (!m15 || m15.length < 2) return [];
    const out = [];
    for (let i = 0; i < m15.length - 1; i += 2) {
        const a = m15[i], b = m15[i + 1];
        out.push({
            time: a.time,
            open: a.open,
            high: Math.max(a.high, b.high),
            low: Math.min(a.low, b.low),
            close: b.close,
            volume: (a.volume || 0) + (b.volume || 0)
        });
    }
    return out;
}

/* =========================================================
   INDICATORS
   ========================================================= */
function getCloses(candles) {
    return candles.map(c => Number(c.close));
}

function calculateEMA(values, period) {
    if (!values || values.length < period) return null;
    const mult = 2 / (period + 1);
    let ema = 0;
    for (let i = 0; i < period; i++) ema += Number(values[i]);
    ema /= period;
    for (let i = period; i < values.length; i++) {
        ema = (Number(values[i]) - ema) * mult + ema;
    }
    return ema;
}

function calculateRSI(candles, period = 14) {
    if (!candles || candles.length <= period) return null;
    const closes = getCloses(candles);
    let gains = 0, losses = 0;
    for (let i = 1; i <= period; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff > 0) gains += diff; else losses += Math.abs(diff);
    }
    let avgGain = gains / period, avgLoss = losses / period;
    for (let i = period + 1; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        const g = diff > 0 ? diff : 0;
        const l = diff < 0 ? Math.abs(diff) : 0;
        avgGain = ((avgGain * (period - 1)) + g) / period;
        avgLoss = ((avgLoss * (period - 1)) + l) / period;
    }
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
}

/* =========================================================
   HTF BIAS — H4 + H1 + M30 EMA50
   ========================================================= */
function getTimeframeBias(candles, emaPeriod = 50) {
    if (!candles || candles.length < emaPeriod + 5) return "RANGE";
    const closes = getCloses(candles);
    const ema = calculateEMA(closes, emaPeriod);
    if (ema === null) return "RANGE";
    const last = closes[closes.length - 1];
    if (last > ema) return "BULL";
    if (last < ema) return "BEAR";
    return "RANGE";
}

function getHTFBias() {
    const h4 = getTimeframeBias(marketData.H4, TSConfig.EMA_PERIOD);
    const h1 = getTimeframeBias(marketData.H1, TSConfig.EMA_PERIOD);
    const m30 = getTimeframeBias(marketData.M30, TSConfig.EMA_PERIOD);

    let bias = "RANGE";
    if (h4 === "BEAR" && h1 === "BEAR" && m30 === "BEAR") bias = "SELL_PREFERRED";
    else if (h4 === "BULL" && h1 === "BULL" && m30 === "BULL") bias = "BUY_PREFERRED";

    return { bias, h4, h1, m30 };
}

/* =========================================================
   M5 STRUCTURE BREAK
   ========================================================= */
function getM5Break() {
    const m5 = marketData.M5;
    if (!m5 || m5.length < 3) return { direction: null, reason: "NO_DATA" };

    const last = m5[m5.length - 1];
    const prior = m5[m5.length - 2];

    if (last.close < prior.low) return { direction: "SELL", reason: "M5_BREAK_LOW" };
    if (last.close > prior.high) return { direction: "BUY", reason: "M5_BREAK_HIGH" };
    return { direction: null, reason: "NO_STRUCTURE_BREAK" };
}

/* =========================================================
   M15 CHoCH (Change of Character)
   ========================================================= */
function getM15CHoCH() {
    const m15 = marketData.M15;
    if (!m15 || m15.length < 3) return null;
    const last = m15[m15.length - 1];
    const prior = m15[m15.length - 2];
    if (last.close > prior.high) return "BULL";
    if (last.close < prior.low) return "BEAR";
    return null;
}

/* =========================================================
   SWEEP CHECK (20-period)
   ========================================================= */
function checkSweep(direction) {
    const m5 = marketData.M5;
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
    const m5 = marketData.M5;
    if (!m5 || m5.length < 60) {
        return { signal: null, direction: null, reason: "INSUFFICIENT_DATA", bias: "RANGE" };
    }

    const rsi = calculateRSI(m5, TSConfig.RSI_PERIOD);
    const { bias, h4, h1, m30 } = getHTFBias();
    const { direction, reason: breakReason } = getM5Break();

    const out = {
        signal: null, direction, bias, rsi,
        h4Trend: h4, h1Trend: h1, m30Trend: m30,
        reason: breakReason
    };

    if (!direction) return out;

    // --- Trend-continuation ---
    if (bias === "SELL_PREFERRED" && direction === "SELL") {
        if (rsi !== null && rsi > TSConfig.RSI_SELL_BLOCK) {
            out.signal = "SELL";
            out.reason = "TREND_CONT_SELL";
            return out;
        }
        out.reason = "RSI_SELL_BLOCK";
        return out;
    }

    if (bias === "BUY_PREFERRED" && direction === "BUY") {
        if (rsi !== null && rsi < TSConfig.RSI_BUY_BLOCK) {
            out.signal = "BUY";
            out.reason = "TREND_CONT_BUY";
            return out;
        }
        out.reason = "RSI_BUY_BLOCK";
        return out;
    }

    // --- Reversal (counter-trend) ---
    if (bias === "SELL_PREFERRED" && direction === "BUY") {
        const swept = checkSweep("BUY");
        const choch = getM15CHoCH();
        if (swept && choch === "BULL" && rsi !== null && rsi < TSConfig.RSI_REVERSAL_BUY) {
            out.signal = "BUY";
            out.reason = "REVERSAL_BUY";
            return out;
        }
        out.reason = "BLOCKED_NO_REVERSAL";
        return out;
    }

    if (bias === "BUY_PREFERRED" && direction === "SELL") {
        const swept = checkSweep("SELL");
        const choch = getM15CHoCH();
        if (swept && choch === "BEAR" && rsi !== null && rsi > TSConfig.RSI_REVERSAL_SELL) {
            out.signal = "SELL";
            out.reason = "REVERSAL_SELL";
            return out;
        }
        out.reason = "BLOCKED_NO_REVERSAL";
        return out;
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

        const response = await fetch(url.toString(), { cache: "no-store" });
        if (!response.ok) throw new Error("News HTTP " + response.status);
        const events = await response.json();
        if (!Array.isArray(events)) throw new Error("Invalid calendar response");

        newsData.events = events
            .filter(e => e && (e.currency === "EUR" || e.currency === "USD" ||
                e.countryCode === "EU" || e.countryCode === "US"))
            .sort((a, b) => new Date(a.time) - new Date(b.time));

        newsData.connected = true;
        newsData.error = null;
        newsData.lastUpdated = new Date();
        newsData.nextEUR = getNextNewsEvent("EUR");
        newsData.nextUSD = getNextNewsEvent("USD");

        const blocker = getCurrentNewsBlocker();
        newsData.blocked = blocker.blocked;
        newsData.blockingEvent = blocker.event;

        updateNewsDisplay();
        return newsData;
    } catch (error) {
        console.error("Calendar error:", error);
        newsData.connected = false;
        newsData.error = error.message;
        newsData.blocked = true;
        updateNewsDisplay();
        return newsData;
    }
}

function getEventCurrency(event) {
    if (!event) return null;
    if (event.currency === "EUR" || event.currency === "USD") return event.currency;
    if (event.countryCode === "EU") return "EUR";
    if (event.countryCode === "US") return "USD";
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
    const window = TSConfig.NEWS_BLOCK_MINUTES * 60 * 1000;
    const blocking = newsData.events.filter(e => {
        const c = getEventCurrency(e);
        if (c !== "EUR" && c !== "USD") return false;
        const t = new Date(e.time).getTime();
        if (!Number.isFinite(t)) return false;
        return Math.abs(now - t) <= window;
    }).sort((a, b) => Math.abs(new Date(a.time) - now) - Math.abs(new Date(b.time) - now));
    return blocking.length > 0
        ? { blocked: true, event: blocking[0] }
        : { blocked: false, event: null };
}

function formatNewsEvent(event) {
    if (!event) return "NONE";
    const cur = getEventCurrency(event) || "—";
    const t = new Date(event.time);
    if (Number.isNaN(t.getTime())) return cur + " • " + (event.name || "Event");
    const india = t.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short",
        hour: "2-digit", minute: "2-digit", hour12: false
    });
    return cur + " • " + (event.name || "Event") + " • " + india + " IST";
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
        setManyText(["economicCalendar", "newsStatus", "calendarStatus"], "NEWS NOT CONFIRMED");
        setManyText(["eurEvents", "eurEventsValue"], "NOT CONFIRMED");
        setManyText(["usdEvents", "usdEventsValue"], "NOT CONFIRMED");
        setManyText(["highImpact", "highImpactValue"], "NEWS NOT CONFIRMED");
        setManyText(["newsBlocker", "newsBlockerStatus"], "BLOCKED");
        return;
    }
    setManyText(["eurEvents", "eurEventsValue"], formatNewsEvent(newsData.nextEUR));
    setManyText(["usdEvents", "usdEventsValue"], formatNewsEvent(newsData.nextUSD));
    const b = evaluateNewsBlocker();
    setManyText(["economicCalendar", "newsStatus", "calendarStatus"], b.status);
    setManyText(["highImpact", "highImpactValue"], b.reason);
    setManyText(["newsBlocker", "newsBlockerStatus"], b.status);
}

/* =========================================================
   TRADE LIFECYCLE
   ========================================================= */
function canOpenNewTrade() {
    resetDayIfNeeded();
    if (tradeState.openTrade !== null) return { ok: false, reason: "TRADE_ALREADY_OPEN" };
    if (tradeState.tradesToday >= TSConfig.MAX_TRADES_PER_DAY)
        return { ok: false, reason: "MAX_TRADES_PER_DAY (" + TSConfig.MAX_TRADES_PER_DAY + ") REACHED" };
    if (tradeState.lastTradeTime) {
        const elapsed = (Date.now() - new Date(tradeState.lastTradeTime).getTime()) / 60000;
        if (elapsed < TSConfig.COOLDOWN_MIN)
            return { ok: false, reason: "COOLDOWN (" + Math.ceil(TSConfig.COOLDOWN_MIN - elapsed) + " min left)" };
    }
    return { ok: true, reason: "OK" };
}

function openTrade(side, entry, reason) {
    const pip = TSConfig.PIP;
    let sl, tp;
    if (side === "BUY") {
        sl = entry - TSConfig.SL_PIPS * pip;
        tp = entry + TSConfig.TP_PIPS * pip;
    } else {
        sl = entry + TSConfig.SL_PIPS * pip;
        tp = entry - TSConfig.TP_PIPS * pip;
    }
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

    if (!outcome && Date.now() >= new Date(t.expiresAt).getTime()) {
        outcome = "timeout";
    }

    if (outcome) {
        const rec = { ...t, outcome, closedAt: new Date().toISOString() };
        tradeState.history.push(rec);
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
    const netPips = hist.reduce((sum, t) => {
        if (t.outcome === "win") return sum + TSConfig.TP_PIPS;
        if (t.outcome === "loss") return sum - TSConfig.SL_PIPS;
        return sum;
    }, 0);
    const wr = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : null;
    return { wins, losses, timeouts, total: hist.length, netPips, winRate: wr };
}

/* =========================================================
   DISPLAY UPDATERS
   ========================================================= */
function updateBiasDisplay(biasData) {
    setManyText(["bias", "htfBias", "htf_bias"], biasData.bias);
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

    if (entry.signal) {
        if (sc) sc.className = "signal-card firing";
        if (sig) sig.textContent = "🔥 " + entry.signal;
    } else if (entry.direction) {
        if (sc) sc.className = "signal-card waiting";
        if (sig) sig.textContent = "🟡 " + entry.direction + " blocked";
    } else {
        if (sc) sc.className = "signal-card waiting";
        if (sig) sig.textContent = "🟡 WAITING";
    }
    if (reason) reason.textContent = entry.reason || "—";

    const co = getElement("can_open");
    if (co) co.textContent = canOpen.reason || "—";
}

function updateStatsDisplay() {
    const s = getStats();
    setText("s_wins", s.wins);
    setText("s_losses", s.losses);
    setText("s_timeouts", s.timeouts);
    setText("s_wr", s.winRate !== null ? s.winRate.toFixed(1) + "%" : "--");
    setText("s_total", s.total + " trades");

    const pipsEl = getElement("s_pips");
    if (pipsEl) {
        pipsEl.textContent = (s.netPips >= 0 ? "+" : "") + s.netPips;
        pipsEl.style.color = s.netPips > 0 ? "#22c55e" : s.netPips < 0 ? "#ef4444" : "#e6e8ef";
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
        <div class="row"><span class="k">SL</span><span class="v">${t.sl}</span></div>
        <div class="row"><span class="k">TP</span><span class="v">${t.tp}</span></div>
        <div class="row"><span class="k">Opened</span><span class="v">${opened}</span></div>
        <div class="row"><span class="k">Expires</span><span class="v">${expires}</span></div>
    </div>`;
}

/* =========================================================
   MAIN REFRESH
   ========================================================= */
async function loadMarketData() {
    if (loadingMarketData) return;
    loadingMarketData = true;

    try {
        await fetchLivePrice();
        await loadAllCandles();

        // 1. If a trade is open, check SL/TP/timeout first
        if (tradeState.openTrade && livePrice !== null) {
            const outcome = updateOpenTrade(livePrice);
            if (outcome) console.log("Trade closed:", outcome);
        }

        // 2. Evaluate entry
        const entry = evaluateEntry();
        const canOpen = canOpenNewTrade();
        const news = evaluateNewsBlocker();

        // 3. Open trade if signal fires, cooldown clear, no news block
        if (entry.signal && canOpen.ok && news.valid) {
            openTrade(entry.signal, livePrice, entry.reason);
            console.log("Trade opened:", entry.signal, "@", livePrice);
        }

        // 4. Update UI
        updateBiasDisplay({ bias: entry.bias, h4: entry.h4Trend, h1: entry.h1Trend, m30: entry.m30Trend });
        updateSignalDisplay(entry, canOpen);
        updateStatsDisplay();
        updateTradeCard();

        // 5. Auxiliary displays
        const m5rsi = getElement("rsi") || getElement("m5RSI");
        if (m5rsi) m5rsi.textContent = entry.rsi !== null ? entry.rsi.toFixed(1) : "—";

        setManyText(["m5_break", "m5Break"], entry.direction ? entry.direction.toLowerCase() : "none");

    } catch (error) {
        console.error("Dashboard error:", error);
    } finally {
        loadingMarketData = false;
    }
}

/* =========================================================
   HIDE CHART UI (from old code, kept)
   ========================================================= */
function hideChartUI() {
    const chartIds = ["chart", "liveChart", "chartContainer", "priceChart", "live-chart", "chart-area"];
    chartIds.forEach(id => {
        const el = getElement(id);
        if (el) el.style.display = "none";
    });
    document.querySelectorAll("[data-timeframe]").forEach(el => el.style.display = "none");
}

/* =========================================================
   STARTUP
   ========================================================= */
async function startDashboard() {
    if (dashboardStarted) return;
    dashboardStarted = true;

    loadState();
    resetDayIfNeeded();

    updateIndiaTime();
    setInterval(updateIndiaTime, 1000);

    hideChartUI();

    await fetchLivePrice();
    await loadMarketData();

    setInterval(loadMarketData, REFRESH_INTERVAL);
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startDashboard);
} else {
    startDashboard();
}

window.TwoSided = {
    marketData,
    tradeState,
    newsData,
    getLivePrice: () => livePrice,
    refresh: loadMarketData,
    refreshNews: fetchEconomicCalendar,
    evaluateEntry,
    getHTFBias,
    getStats,
    resetState: () => {
        tradeState = { openTrade: null, lastTradeTime: null, tradesToday: 0, currentDay: null, lastOutcome: null, history: [] };
        saveState();
    }
};
