/* =========================================================
   EUR/USD SNIPER DASHBOARD
   V2 — MARKET DATA FOUNDATION
   ========================================================= */

"use strict";

/* =========================================================
   GLOBAL STATE
   ========================================================= */

const MarketState = {

    pair: "EUR/USD",

    livePrice: null,

    candles: {
        H4: [],
        H1: [],
        M15: [],
        M5: []
    },

    indicators: {
        EMA20: null,
        EMA50: null,
        EMA200: null,
        RSI14: null,
        momentum: null
    },

    connected: false,

    lastUpdate: null

};


/* =========================================================
   DOM HELPERS
   ========================================================= */

function setText(id, value) {

    const element = document.getElementById(id);

    if (!element) return;

    element.textContent = value;

}


/* =========================================================
   PRICE DISPLAY
   ========================================================= */

function updatePriceDisplay() {

    if (
        MarketState.livePrice === null ||
        !Number.isFinite(MarketState.livePrice)
    ) {

        setText("livePrice", "—");
        setText("chartPrice", "—");
        setText("srPrice", "—");

        return;
    }

    const price = MarketState.livePrice.toFixed(5);

    setText("livePrice", price);
    setText("chartPrice", price);
    setText("srPrice", price);

}


/* =========================================================
   DATA STATUS
   ========================================================= */

function updateDataStatus(message) {

    setText("chartState", message);

}


/* =========================================================
   M5 CANDLE STATUS
   ========================================================= */

function updateM5Status() {

    const candles = MarketState.candles.M5;

    if (!candles || candles.length === 0) {

        setText("candleStatus", "WAITING");

        return;
    }

    setText("candleStatus", "READY");

}


/* =========================================================
   EMA CALCULATION
   ========================================================= */

function calculateEMA(values, period) {

    if (!Array.isArray(values)) return null;

    if (values.length < period) return null;

    const multiplier = 2 / (period + 1);

    let ema =
        values
        .slice(0, period)
        .reduce((sum, value) => sum + value, 0) / period;

    for (let i = period; i < values.length; i++) {

        ema =
            ((values[i] - ema) * multiplier) + ema;

    }

    return ema;

}


/* =========================================================
   RSI CALCULATION
   ========================================================= */

function calculateRSI(values, period = 14) {

    if (!Array.isArray(values)) return null;

    if (values.length <= period) return null;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {

        const difference =
            values[i] - values[i - 1];

        if (difference >= 0) {

            gains += difference;

        } else {

            losses += Math.abs(difference);

        }

    }

    let averageGain = gains / period;
    let averageLoss = losses / period;

    for (let i = period + 1; i < values.length; i++) {

        const difference =
            values[i] - values[i - 1];

        const gain =
            difference > 0 ? difference : 0;

        const loss =
            difference < 0 ? Math.abs(difference) : 0;

        averageGain =
            ((averageGain * (period - 1)) + gain) / period;

        averageLoss =
            ((averageLoss * (period - 1)) + loss) / period;

    }

    if (averageLoss === 0) return 100;

    const relativeStrength =
        averageGain / averageLoss;

    return 100 -
        (100 / (1 + relativeStrength));

}


/* =========================================================
   MOMENTUM
   ========================================================= */

function calculateMomentum(values, lookback = 5) {

    if (!Array.isArray(values)) return null;

    if (values.length <= lookback) return null;

    const current =
        values[values.length - 1];

    const previous =
        values[values.length - 1 - lookback];

    if (!Number.isFinite(current) ||
        !Number.isFinite(previous)) {

        return null;
    }

    return current - previous;

}


/* =========================================================
   M5 INDICATORS
   ========================================================= */

function calculateM5Indicators() {

    const candles =
        MarketState.candles.M5;

    if (!candles || candles.length === 0) {

        return;
    }

    const closes =
        candles
        .map(candle => Number(candle.close))
        .filter(Number.isFinite);

    if (closes.length === 0) {

        return;
    }

    const ema20 =
        calculateEMA(closes, 20);

    const ema50 =
        calculateEMA(closes, 50);

    const ema200 =
        calculateEMA(closes, 200);

    const rsi =
        calculateRSI(closes, 14);

    const momentum =
        calculateMomentum(closes, 5);


    MarketState.indicators.EMA20 = ema20;
    MarketState.indicators.EMA50 = ema50;
    MarketState.indicators.EMA200 = ema200;
    MarketState.indicators.RSI14 = rsi;
    MarketState.indicators.momentum = momentum;


    setText(
        "ema20",
        Number.isFinite(ema20)
            ? ema20.toFixed(5)
            : "—"
    );

    setText(
        "ema50",
        Number.isFinite(ema50)
            ? ema50.toFixed(5)
            : "—"
    );

    setText(
        "ema200",
        Number.isFinite(ema200)
            ? ema200.toFixed(5)
            : "—"
    );

    setText(
        "rsi",
        Number.isFinite(rsi)
            ? rsi.toFixed(2)
            : "—"
    );

    setText(
        "momentum",
        Number.isFinite(momentum)
            ? momentum.toFixed(5)
            : "—"
    );

}


/* =========================================================
   CONNECTION STATUS
   ========================================================= */

function setWaitingState() {

    MarketState.connected = false;

    updateDataStatus(
        "DATA ENGINE: WAITING"
    );

    setText(
        "candleStatus",
        "WAITING"
    );

}


/* =========================================================
   MARKET DATA PLACEHOLDER
   =========================================================

   IMPORTANT:

   This function intentionally does NOT generate fake
   prices or fake candles.

   The secure market-data connection will be added next.

   ========================================================= */

async function loadMarketData() {

    setWaitingState();

    console.log(
        "Market data engine waiting for secure connection."
    );

}


/* =========================================================
   DASHBOARD REFRESH
   ========================================================= */

async function refreshDashboard() {

    await loadMarketData();

}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initializeDashboard() {

    console.log(
        "EUR/USD Sniper Dashboard V2 initialized."
    );

    setWaitingState();

    updatePriceDisplay();

    updateM5Status();

    await loadMarketData();

}


/* =========================================================
   START
   ========================================================= */

initializeDashboard();


/* =========================================================
   PERIODIC REFRESH
   =========================================================

   Later this will request fresh market data.

   ========================================================= */

setInterval(
    refreshDashboard,
    30000
);
