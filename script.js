/* =========================================================
   EUR/USD SNIPER DASHBOARD
   ENGINE 3 — ELITE TRADE GATE
   LIVE MARKET DATA + MTF ANALYSIS + LIVE M5 CHART

   NO SIMULATED DATA
   NO FAKE PRICES
   ========================================================= */


/* =========================================================
   CONFIGURATION
   ========================================================= */

const TWELVE_DATA_API_KEY = "53821bf38bec40e4a88bd1fa06ac32b3";

const TWELVE_DATA_BASE = "https://api.twelvedata.com";

const PAIR = "EUR/USD";

const AUTO_REFRESH_MS = 30000;


/* =========================================================
   ENGINE 3 CONFIGURATION
   ========================================================= */

const Engine3Config = {

    RSI_PERIOD: 14,

    RSI_OVERSOLD: 30,
    RSI_OVERBOUGHT: 70,

    RSI_BUY_MIN: 35,
    RSI_BUY_MAX: 68,

    RSI_SELL_MIN: 32,
    RSI_SELL_MAX: 65,

    EMA_EXTENSION_ATR: 1.5,

    MIN_RR: 2.0,

    STRUCTURE_LOOKBACK: 20,

    SWING_LOOKBACK: 2,

    SR_LOOKBACK: 30,

    SR_ZONE_ATR: 0.50,

    MOMENTUM_LOOKBACK: 5,

    REQUIRED_SCORE: 8

};


/* =========================================================
   MARKET STATE
   ========================================================= */

const MarketState = {

    livePrice: null,
    livePriceTime: null,

    candles: {

        H4: [],
        H1: [],
        M15: [],
        M5: []

    },

    indicators: {

        H4: {},
        H1: {},
        M15: {},
        M5: {}

    },

    analysis: {

        H4: {},
        H1: {},
        M15: {},
        M5: {}

    },

    supportResistance: {},

    news: {

        status: "UNKNOWN",
        eur: [],
        usd: [],
        highImpact: []

    },

    session: "",

    connected: false,

    loading: false,

    lastUpdate: null,

    engine3: {

        direction: null,
        score: 0,
        decision: "WAIT",
        reason: "Waiting for market data",

        buy: null,
        sell: null

    }

};


/* =========================================================
   CHART STATE
   ========================================================= */

const ChartState = {

    chart: null,

    candleSeries: null,

    ema20Series: null,
    ema50Series: null,
    ema200Series: null,

    initialized: false

};


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function $(id) {

    return document.getElementById(id);

}


function setText(id, value) {

    const element = $(id);

    if (element) {

        element.textContent =
            value === null ||
            value === undefined ||
            value === ""
                ? "—"
                : value;

    }

}


function safeNumber(value) {

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;

}


function formatPrice(value) {

    const number = safeNumber(value);

    if (number === null) return "—";

    return number.toFixed(5);

}


function formatNumber(value, decimals = 5) {

    const number = safeNumber(value);

    if (number === null) return "—";

    return number.toFixed(decimals);

}


function clamp(value, min, max) {

    return Math.max(min, Math.min(max, value));

}


/* =========================================================
   TWELVE DATA REQUEST
   ========================================================= */

async function twelveDataFetch(endpoint, params = {}) {

    if (
        !TWELVE_DATA_API_KEY ||
        TWELVE_DATA_API_KEY === "YOUR_TWELVE_DATA_API_KEY"
    ) {

        throw new Error(
            "Twelve Data API key has not been entered"
        );

    }

    const query = new URLSearchParams({

        ...params,

        apikey: TWELVE_DATA_API_KEY

    });

    const url =
        `${TWELVE_DATA_BASE}${endpoint}?${query.toString()}`;

    const response = await fetch(url);

    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}`
        );

    }

    const data = await response.json();

    if (
        data.status === "error" ||
        data.code
    ) {

        throw new Error(
            data.message ||
            `Twelve Data error ${data.code || ""}`
        );

    }

    return data;

}


/* =========================================================
   LIVE PRICE
   ========================================================= */

async function fetchLivePrice() {

    const data = await twelveDataFetch(

        "/price",

        {

            symbol: PAIR

        }

    );

    const price = safeNumber(data.price);

    if (price === null) {

        throw new Error(
            "Invalid live price"
        );

    }

    MarketState.livePrice = price;

    MarketState.livePriceTime =
        new Date();

    MarketState.connected = true;

    setText(
        "price",
        formatPrice(price)
    );

    setText(
        "chartPrice",
        formatPrice(price)
    );

}


/* =========================================================
   CANDLE DATA
   ========================================================= */

function normalizeCandle(value) {

    if (!value) return null;

    const time =
        value.datetime ||
        value.timestamp;

    const open = safeNumber(value.open);
    const high = safeNumber(value.high);
    const low = safeNumber(value.low);
    const close = safeNumber(value.close);

    if (
        !time ||
        open === null ||
        high === null ||
        low === null ||
        close === null
    ) {

        return null;

    }

    return {

        datetime: String(time),

        open,
        high,
        low,
        close,

        volume:
            safeNumber(value.volume) || 0

    };

}


/* =========================================================
   FETCH CANDLES
   ========================================================= */

async function fetchCandles(interval) {

    const data = await twelveDataFetch(

        "/time_series",

        {

            symbol: PAIR,

            interval: interval,

            outputsize: 250,

            format: "JSON"

        }

    );

    if (
        !data.values ||
        !Array.isArray(data.values)
    ) {

        throw new Error(
            `No ${interval} candle data`
        );

    }

    const candles =
        data.values

            .map(normalizeCandle)

            .filter(Boolean)

            .reverse();

    if (candles.length < 20) {

        throw new Error(
            `${interval}: insufficient candles`
        );

    }

    return candles;

}


/* =========================================================
   LOAD EACH TIMEFRAME INDEPENDENTLY
   ========================================================= */

async function loadTimeframe(
    key,
    interval
) {

    try {

        const candles =
            await fetchCandles(interval);

        MarketState.candles[key] = candles;

        MarketState.indicators[key] =
            calculateIndicators(candles);

        MarketState.analysis[key] =
            analyzeTimeframe(
                candles,
                MarketState.indicators[key]
            );

        return true;

    } catch (error) {

        console.warn(
            `${key} data error:`,
            error.message
        );

        MarketState.candles[key] = [];

        MarketState.indicators[key] = {};

        MarketState.analysis[key] = {

            direction: "WAITING",
            structure: "Waiting for data"

        };

        return false;

    }

}


/* =========================================================
   LOAD MARKET DATA
   ========================================================= */

async function loadMarketData() {

    if (MarketState.loading) return;

    MarketState.loading = true;

    try {

        /*
           PRICE IS INDEPENDENT.
           ONE FAILED TIMEFRAME MUST NOT
           DESTROY THE OTHER DATA.
        */

        try {

            await fetchLivePrice();

        } catch (error) {

            console.error(
                "Live price error:",
                error.message
            );

            MarketState.connected = false;

            setText(
                "price",
                "Unavailable"
            );

        }


        /*
           LOAD M5 FIRST.
           THE CHART ONLY NEEDS M5.
        */

        const m5Loaded =
            await loadTimeframe(
                "M5",
                "5min"
            );


        /*
           OTHER TIMEFRAMES ARE INDEPENDENT.
        */

        await Promise.allSettled([

            loadTimeframe(
                "M15",
                "15min"
            ),

            loadTimeframe(
                "H1",
                "1h"
            ),

            loadTimeframe(
                "H4",
                "4h"
            )

        ]);


        updateDashboard();

        updateFinancialChart(
            m5Loaded
        );

        runEngine3();


        MarketState.lastUpdate =
            new Date();

        setText(
            "trend",
            `Twelve Data connected • Updated: ${MarketState.lastUpdate.toLocaleTimeString()}`
        );

    } catch (error) {

        console.error(
            "Market loading error:",
            error
        );

    } finally {

        MarketState.loading = false;

    }

}


/* =========================================================
   EMA
   ========================================================= */

function calculateEMA(candles, period) {

    if (
        !candles ||
        candles.length < period
    ) {

        return [];

    }

    const result = [];

    const multiplier =
        2 / (period + 1);

    let sum = 0;

    for (
        let i = 0;
        i < period;
        i++
    ) {

        sum += candles[i].close;

    }

    let ema =
        sum / period;

    result[period - 1] = ema;

    for (
        let i = period;
        i < candles.length;
        i++
    ) {

        ema =
            (
                candles[i].close -
                ema
            ) *
            multiplier +
            ema;

        result[i] = ema;

    }

    return result;

}


/* =========================================================
   RSI
   ========================================================= */

function calculateRSI(
    candles,
    period = 14
) {

    if (
        !candles ||
        candles.length <= period
    ) {

        return null;

    }

    let gains = 0;
    let losses = 0;

    for (
        let i = 1;
        i <= period;
        i++
    ) {

        const change =
            candles[i].close -
            candles[i - 1].close;

        if (change >= 0) {

            gains += change;

        } else {

            losses += Math.abs(change);

        }

    }

    let averageGain =
        gains / period;

    let averageLoss =
        losses / period;

    for (
        let i = period + 1;
        i < candles.length;
        i++
    ) {

        const change =
            candles[i].close -
            candles[i - 1].close;

        const gain =
            change > 0 ? change : 0;

        const loss =
            change < 0
                ? Math.abs(change)
                : 0;

        averageGain =
            (
                averageGain *
                (period - 1) +
                gain
            ) / period;

        averageLoss =
            (
                averageLoss *
                (period - 1) +
                loss
            ) / period;

    }

    if (averageLoss === 0) {

        return 100;

    }

    const rs =
        averageGain /
        averageLoss;

    return 100 -
        (100 / (1 + rs));

}


/* =========================================================
   ATR
   ========================================================= */

function calculateATR(
    candles,
    period = 14
) {

    if (
        !candles ||
        candles.length <= period
    ) {

        return null;

    }

    const trs = [];

    for (
        let i = 1;
        i < candles.length;
        i++
    ) {

        const current =
            candles[i];

        const previous =
            candles[i - 1];

        const tr =
            Math.max(

                current.high -
                    current.low,

                Math.abs(
                    current.high -
                    previous.close
                ),

                Math.abs(
                    current.low -
                    previous.close
                )

            );

        trs.push(tr);

    }

    if (trs.length < period) {

        return null;

    }

    let atr = 0;

    for (
        let i = 0;
        i < period;
        i++
    ) {

        atr += trs[i];

    }

    atr /= period;

    for (
        let i = period;
        i < trs.length;
        i++
    ) {

        atr =
            (
                atr *
                (period - 1) +
                trs[i]
            ) / period;

    }

    return atr;

}


/* =========================================================
   MOMENTUM
   ========================================================= */

function calculateMomentum(
    candles,
    lookback = 5
) {

    if (
        !candles ||
        candles.length <= lookback
    ) {

        return null;

    }

    const last =
        candles.length - 1;

    return (
        candles[last].close -
        candles[last - lookback].close
    );

}


/* =========================================================
   CANDLE QUALITY
   ========================================================= */

function calculateCandleQuality(
    candle
) {

    if (!candle) return null;

    const range =
        candle.high -
        candle.low;

    if (range <= 0) return null;

    const body =
        Math.abs(
            candle.close -
            candle.open
        );

    const bodyRatio =
        body / range;

    return {

        bodyRatio,

        bullish:
            candle.close >
            candle.open,

        bearish:
            candle.close <
            candle.open,

        strong:
            bodyRatio >= 0.55

    };

}


/* =========================================================
   INDICATORS
   ========================================================= */

function calculateIndicators(candles) {

    if (
        !candles ||
        candles.length === 0
    ) {

        return {};

    }

    const ema20 =
        calculateEMA(candles, 20);

    const ema50 =
        calculateEMA(candles, 50);

    const ema200 =
        calculateEMA(candles, 200);

    const last =
        candles.length - 1;

    return {

        ema20:
            ema20[last] ?? null,

        ema50:
            ema50[last] ?? null,

        ema200:
            ema200[last] ?? null,

        ema20Series:
            ema20,

        ema50Series:
            ema50,

        ema200Series:
            ema200,

        rsi:
            calculateRSI(
                candles,
                Engine3Config.RSI_PERIOD
            ),

        momentum:
            calculateMomentum(
                candles,
                Engine3Config.MOMENTUM_LOOKBACK
            ),

        atr:
            calculateATR(
                candles,
                14
            ),

        candleQuality:
            calculateCandleQuality(
                candles[last]
            )

    };

}


/* =========================================================
   MARKET STRUCTURE
   ========================================================= */

function getSwingHigh(
    candles,
    lookback = 2
) {

    if (
        !candles ||
        candles.length <
            lookback * 2 + 1
    ) {

        return null;

    }

    const highs = [];

    for (
        let i = lookback;
        i <
            candles.length -
            lookback;
        i++
    ) {

        let isSwing = true;

        for (
            let j = 1;
            j <= lookback;
            j++
        ) {

            if (
                candles[i].high <=
                    candles[i - j].high ||
                candles[i].high <=
                    candles[i + j].high
            ) {

                isSwing = false;

                break;

            }

        }

        if (isSwing) {

            highs.push({

                index: i,

                price:
                    candles[i].high

            });

        }

    }

    return highs.length
        ? highs[highs.length - 1]
        : null;

}


function getSwingLow(
    candles,
    lookback = 2
) {

    if (
        !candles ||
        candles.length <
            lookback * 2 + 1
    ) {

        return null;

    }

    const lows = [];

    for (
        let i = lookback;
        i <
            candles.length -
            lookback;
        i++
    ) {

        let isSwing = true;

        for (
            let j = 1;
            j <= lookback;
            j++
        ) {

            if (
                candles[i].low >=
                    candles[i - j].low ||
                candles[i].low >=
                    candles[i + j].low
            ) {

                isSwing = false;

                break;

            }

        }

        if (isSwing) {

            lows.push({

                index: i,

                price:
                    candles[i].low

            });

        }

    }

    return lows.length
        ? lows[lows.length - 1]
        : null;

}


/* =========================================================
   TIMEFRAME ANALYSIS
   ========================================================= */

function analyzeTimeframe(
    candles,
    indicators
) {

    if (
        !candles ||
        candles.length < 20
    ) {

        return {

            direction: "WAITING",

            structure:
                "Waiting for data"

        };

    }

    const last =
        candles[candles.length - 1];

    const ema20 =
        indicators.ema20;

    const ema50 =
        indicators.ema50;

    const ema200 =
        indicators.ema200;

    let direction =
        "NEUTRAL";

    if (
        ema20 !== null &&
        ema50 !== null &&
        ema200 !== null
    ) {

        if (
            last.close > ema20 &&
            ema20 > ema50 &&
            ema50 > ema200
        ) {

            direction = "BULLISH";

        } else if (
            last.close < ema20 &&
            ema20 < ema50 &&
            ema50 < ema200
        ) {

            direction = "BEARISH";

        }

    }

    const swingHigh =
        getSwingHigh(
            candles,
            Engine3Config.SWING_LOOKBACK
        );

    const swingLow =
        getSwingLow(
            candles,
            Engine3Config.SWING_LOOKBACK
        );

    let structure =
        "RANGE";

    if (
        swingHigh &&
        swingLow
    ) {

        const recent =
            candles
                .slice(-20);

        const recentHigh =
            Math.max(
                ...recent.map(
                    c => c.high
                )
            );

        const recentLow =
            Math.min(
                ...recent.map(
                    c => c.low
                )
            );

        if (
            last.close >
            (recentHigh -
                (recentHigh -
                    recentLow) * 0.25)
        ) {

            structure =
                direction === "BULLISH"
                    ? "HIGHER-HIGH / BULLISH"
                    : "NEAR RESISTANCE";

        } else if (
            last.close <
            (recentLow +
                (recentHigh -
                    recentLow) * 0.25)
        ) {

            structure =
                direction === "BEARISH"
                    ? "LOWER-LOW / BEARISH"
                    : "NEAR SUPPORT";

        }

    }

    return {

        direction,

        structure,

        swingHigh:
            swingHigh
                ? swingHigh.price
                : null,

        swingLow:
            swingLow
                ? swingLow.price
                : null

    };

}


/* =========================================================
   SUPPORT / RESISTANCE
   ========================================================= */

function calculateSupportResistance(
    candles
) {

    if (
        !candles ||
        candles.length < 20
    ) {

        return {};

    }

    const sample =
        candles.slice(
            -Engine3Config.SR_LOOKBACK
        );

    const highs =
        sample.map(
            candle => candle.high
        );

    const lows =
        sample.map(
            candle => candle.low
        );

    const resistance1 =
        Math.max(...highs);

    const support1 =
        Math.min(...lows);

    const midpoint =
        (
            resistance1 +
            support1
        ) / 2;

    const resistanceCandidates =
        highs.filter(
            value =>
                value > midpoint
        );

    const supportCandidates =
        lows.filter(
            value =>
                value < midpoint
        );

    const resistance2 =
        resistanceCandidates.length > 1
            ? Math.min(
                ...resistanceCandidates
            )
            : resistance1;

    const support2 =
        supportCandidates.length > 1
            ? Math.max(
                ...supportCandidates
            )
            : support1;

    return {

        resistance1,
        resistance2,

        support1,
        support2,

        midpoint

    };

}


/* =========================================================
   SESSION
   ========================================================= */

function getTradingSession() {

    const now =
        new Date();

    const utcHour =
        now.getUTCHours();

    if (
        utcHour >= 7 &&
        utcHour < 12
    ) {

        return "LONDON";

    }

    if (
        utcHour >= 12 &&
        utcHour < 17
    ) {

        return "LONDON / NEW YORK";

    }

    if (
        utcHour >= 17 &&
        utcHour < 21
    ) {

        return "NEW YORK";

    }

    return "ASIA / OFF-SESSION";

}


/* =========================================================
   RSI PROTECTION
   ========================================================= */

function getRSIProtection(
    rsi,
    direction
) {

    if (
        rsi === null ||
        !Number.isFinite(rsi)
    ) {

        return {

            valid: false,

            status:
                "RSI DATA UNAVAILABLE"

        };

    }

    if (
        direction === "BUY"
    ) {

        if (
            rsi >=
            Engine3Config.RSI_OVERBOUGHT
        ) {

            return {

                valid: false,

                status:
                    "BUY BLOCKED — OVERBOUGHT"

            };

        }

        if (
            rsi <
            Engine3Config.RSI_BUY_MIN
        ) {

            return {

                valid: false,

                status:
                    "BUY RSI TOO WEAK"

            };

        }

        return {

            valid: true,

            status:
                "BUY RSI SAFE"

        };

    }


    if (
        direction === "SELL"
    ) {

        if (
            rsi <=
            Engine3Config.RSI_OVERSOLD
        ) {

            return {

                valid: false,

                status:
                    "SELL BLOCKED — OVERSOLD"

            };

        }

        if (
            rsi >
            Engine3Config.RSI_SELL_MAX
        ) {

            return {

                valid: false,

                status:
                    "SELL RSI TOO STRONG"

            };

        }

        return {

            valid: true,

            status:
                "SELL RSI SAFE"

        };

    }

    return {

        valid: false,

        status:
            "RSI WAITING"

    };

}


/* =========================================================
   EMA EXTENSION PROTECTION
   ========================================================= */

function checkEMAExtension(
    price,
    indicators
) {

    if (
        price === null ||
        !indicators.atr ||
        !indicators.ema20
    ) {

        return {

            valid: false,

            status:
                "EMA EXTENSION DATA UNAVAILABLE"

        };

    }

    const distance =
        Math.abs(
            price -
            indicators.ema20
        );

    const limit =
        indicators.atr *
        Engine3Config.EMA_EXTENSION_ATR;

    if (
        distance >
        limit
    ) {

        return {

            valid: false,

            status:
                "EXTENDED — WAIT FOR RESET",

            distance,

            limit

        };

    }

    return {

        valid: true,

        status:
            "EMA EXTENSION SAFE",

        distance,

        limit

    };

}


/* =========================================================
   A+ REVERSAL DETECTION
   ========================================================= */

function detectReversal(
    candles,
    indicators
) {

    if (
        !candles ||
        candles.length < 3
    ) {

        return {

            valid: false,

            type: "NONE"

        };

    }

    const last =
        candles[candles.length - 1];

    const previous =
        candles[candles.length - 2];

    const rsi =
        indicators.rsi;

    if (
        rsi === null
    ) {

        return {

            valid: false,

            type: "NONE"

        };

    }

    const bullishReversal =

        rsi <= 40 &&

        last.close >
        last.open &&

        previous.close <
        previous.open &&

        last.close >
        previous.open;

    const bearishReversal =

        rsi >= 60 &&

        last.close <
        last.open &&

        previous.close >
        previous.open &&

        last.close <
        previous.open;

    if (bullishReversal) {

        return {

            valid: true,

            type: "BULLISH REVERSAL"

        };

    }

    if (bearishReversal) {

        return {

            valid: true,

            type: "BEARISH REVERSAL"

        };

    }

    return {

        valid: false,

        type: "NONE"

    };

}


/* =========================================================
   STRUCTURAL STOP LOSS
   ========================================================= */

function calculateStructuralSL(
    direction,
    candles,
    atr
) {

    if (
        !candles ||
        candles.length < 10 ||
        atr === null
    ) {

        return null;

    }

    const recent =
        candles.slice(-20);

    if (
        direction === "BUY"
    ) {

        const swingLow =
            Math.min(
                ...recent.map(
                    candle =>
                        candle.low
                )
            );

        return (
            swingLow -
            atr * 0.20
        );

    }

    if (
        direction === "SELL"
    ) {

        const swingHigh =
            Math.max(
                ...recent.map(
                    candle =>
                        candle.high
                )
            );

        return (
            swingHigh +
            atr * 0.20
        );

    }

    return null;

}


/* =========================================================
   R:R CALCULATION
   ========================================================= */

function calculateRR(
    direction,
    entry,
    sl,
    supportResistance
) {

    if (
        entry === null ||
        sl === null
    ) {

        return {

            rr: null,

            tp1: null,

            tp2: null

        };

    }

    let tp1;
    let tp2;

    if (
        direction === "BUY"
    ) {

        const risk =
            entry - sl;

        if (risk <= 0) {

            return {

                rr: null,

                tp1: null,

                tp2: null

            };

        }

        tp1 =
            entry +
            risk * 2;

        tp2 =
            entry +
            risk * 3;

    } else {

        const risk =
            sl - entry;

        if (risk <= 0) {

            return {

                rr: null,

                tp1: null,

                tp2: null

            };

        }

        tp1 =
            entry -
            risk * 2;

        tp2 =
            entry -
            risk * 3;

    }

    const risk =
        Math.abs(
            entry - sl
        );

    const reward =
        Math.abs(
            tp1 - entry
        );

    return {

        rr:
            risk > 0
                ? reward / risk
                : null,

        tp1,

        tp2

    };

}


/* =========================================================
   DIRECTION AGREEMENT
   ========================================================= */

function getHigherTimeframeDirection() {

    const h4 =
        MarketState.analysis.H4;

    const h1 =
        MarketState.analysis.H1;

    if (
        !h4 ||
        !h1
    ) {

        return "WAITING";

    }

    if (
        h4.direction === "BULLISH" &&
        h1.direction === "BULLISH"
    ) {

        return "BUY";

    }

    if (
        h4.direction === "BEARISH" &&
        h1.direction === "BEARISH"
    ) {

        return "SELL";

    }

    return "CONFLICT";

}


/* =========================================================
   ENGINE 3 ANALYSIS
   ========================================================= */

function evaluateTradeGate(
    direction
) {

    const h4 =
        MarketState.analysis.H4;

    const h1 =
        MarketState.analysis.H1;

    const m15 =
        MarketState.analysis.M15;

    const m5 =
        MarketState.analysis.M5;

    const candles =
        MarketState.candles.M5;

    const indicators =
        MarketState.indicators.M5;

    const price =
        MarketState.livePrice;

    if (
        !price ||
        !candles.length
    ) {

        return {

            direction,

            score: 0,

            approved: false,

            reason:
                "Waiting for complete market data"

        };

    }


    let score = 0;


    /* -------------------------------------------------------
       1. H4 + H1 DIRECTION
       ------------------------------------------------------- */

    const directionOK =

        direction === "BUY"

            ? (
                h4.direction ===
                    "BULLISH" &&
                h1.direction ===
                    "BULLISH"
            )

            : (
                h4.direction ===
                    "BEARISH" &&
                h1.direction ===
                    "BEARISH"
            );

    if (directionOK) {

        score++;

    }


    /* -------------------------------------------------------
       2. M15 + M5 STRUCTURE
       ------------------------------------------------------- */

    const structureOK =

        direction === "BUY"

            ? (
                m15.direction !==
                    "BEARISH" &&
                m5.direction !==
                    "BEARISH"
            )

            : (
                m15.direction !==
                    "BULLISH" &&
                m5.direction !==
                    "BULLISH"
            );

    if (structureOK) {

        score++;

    }


    /* -------------------------------------------------------
       3. EMA ALIGNMENT
       ------------------------------------------------------- */

    const emaOK =

        direction === "BUY"

            ? (
                indicators.ema20 >
                indicators.ema50 &&
                indicators.ema50 >
                indicators.ema200
            )

            : (
                indicators.ema20 <
                indicators.ema50 &&
                indicators.ema50 <
                indicators.ema200
            );

    if (emaOK) {

        score++;

    }


    /* -------------------------------------------------------
       4. RSI SAFETY
       ------------------------------------------------------- */

    const rsi =
        indicators.rsi;

    const rsiOK =

        direction === "BUY"

            ? (
                rsi >=
                    Engine3Config.RSI_BUY_MIN &&
                rsi <=
                    Engine3Config.RSI_BUY_MAX
            )

            : (
                rsi >=
                    Engine3Config.RSI_SELL_MIN &&
                rsi <=
                    Engine3Config.RSI_SELL_MAX
            );

    if (rsiOK) {

        score++;

    }


    /* -------------------------------------------------------
       5. RSI OVERBOUGHT / OVERSOLD PROTECTION
       ------------------------------------------------------- */

    const rsiProtection =
        getRSIProtection(
            rsi,
            direction
        );

    if (
        rsiProtection.valid
    ) {

        score++;

    }


    /* -------------------------------------------------------
       6. MOMENTUM
       ------------------------------------------------------- */

    const momentum =
        indicators.momentum;

    const momentumOK =

        direction === "BUY"

            ? momentum > 0

            : momentum < 0;

    if (momentumOK) {

        score++;

    }


    /* -------------------------------------------------------
       7. CANDLE QUALITY
       ------------------------------------------------------- */

    const candleQuality =
        indicators.candleQuality;

    const candleOK =

        candleQuality &&
        candleQuality.strong &&

        (
            direction === "BUY"
                ? candleQuality.bullish
                : candleQuality.bearish
        );

    if (candleOK) {

        score++;

    }


    /* -------------------------------------------------------
       8. EMA EXTENSION
       ------------------------------------------------------- */

    const extension =
        checkEMAExtension(
            price,
            indicators
        );

    if (extension.valid) {

        score++;

    }


    /* -------------------------------------------------------
       9. SESSION
       ------------------------------------------------------- */

    const session =
        getTradingSession();

    const sessionOK =
        session === "LONDON" ||
        session === "LONDON / NEW YORK" ||
        session === "NEW YORK";

    /*
       Session is CONTEXT.
       It is NOT a hard blocker.
    */


    /* -------------------------------------------------------
       10. SUPPORT / RESISTANCE
       ------------------------------------------------------- */

    const sr =
        MarketState.supportResistance;

    let srOK = true;

    if (
        direction === "BUY" &&
        sr.resistance1
    ) {

        const distance =
            sr.resistance1 -
            price;

        /*
           Do not buy directly underneath
           major resistance.
        */

        if (
            distance >= 0 &&
            indicators.atr &&
            distance <
                indicators.atr * 0.50
        ) {

            srOK = false;

        }

    }

    if (
        direction === "SELL" &&
        sr.support1
    ) {

        const distance =
            price -
            sr.support1;

        /*
           Do not sell directly above
           major support.
        */

        if (
            distance >= 0 &&
            indicators.atr &&
            distance <
                indicators.atr * 0.50
        ) {

            srOK = false;

        }

    }

    if (srOK) {

        score++;

    }


    /* -------------------------------------------------------
       11. HIGH IMPACT NEWS
       ------------------------------------------------------- */

    /*
       IMPORTANT:
       No real economic calendar is connected yet.

       Therefore UNKNOWN is NOT treated as CLEAR.

       This prevents Engine 3 from pretending
       that the news environment is safe.
    */

    const newsOK =
        MarketState.news.status === "CLEAR";

    if (newsOK) {

        score++;

    }


    /* -------------------------------------------------------
       12. STRUCTURAL SL
       ------------------------------------------------------- */

    const sl =
        calculateStructuralSL(
            direction,
            candles,
            indicators.atr
        );

    const slOK =
        sl !== null &&
        (
            direction === "BUY"
                ? sl < price
                : sl > price
        );

    if (slOK) {

        score++;

    }


    /* -------------------------------------------------------
       13. REAL R:R
       ------------------------------------------------------- */

    const rrData =
        calculateRR(
            direction,
            price,
            sl,
            sr
        );

    const rrOK =
        rrData.rr !== null &&
        rrData.rr >=
            Engine3Config.MIN_RR;

    if (rrOK) {

        score++;

    }


    /* -------------------------------------------------------
       14. A+ REVERSAL
       ------------------------------------------------------- */

    const reversal =
        detectReversal(
            candles,
            indicators
        );

    /*
       Reversal is an additional confirmation.
       It is not mandatory when the trend setup
       is already valid.
    */

    if (reversal.valid) {

        score++;

    }


    /* -------------------------------------------------------
       HARD BLOCKS
       ------------------------------------------------------- */

    const hardBlocked =

        !directionOK ||

        !structureOK ||

        !emaOK ||

        !rsiProtection.valid ||

        !extension.valid ||

        !newsOK ||

        !slOK ||

        !rrOK;


    const approved =

        !hardBlocked &&

        score >=
            Engine3Config.REQUIRED_SCORE;


    let reason =
        "A+ setup not confirmed";


    if (!directionOK) {

        reason =
            "H4 + H1 direction not aligned";

    } else if (!structureOK) {

        reason =
            "M15 + M5 structure not aligned";

    } else if (!emaOK) {

        reason =
            "M5 EMA alignment failed";

    } else if (
        !rsiProtection.valid
    ) {

        reason =
            rsiProtection.status;

    } else if (!extension.valid) {

        reason =
            extension.status;

    } else if (!newsOK) {

        reason =
            "High-impact news status not confirmed";

    } else if (!slOK) {

        reason =
            "Structural stop loss invalid";

    } else if (!rrOK) {

        reason =
            "Real R:R below 1:2";

    } else if (
        score <
        Engine3Config.REQUIRED_SCORE
    ) {

        reason =
            `A+ score ${score}/10 required`;

    } else {

        reason =
            `${direction} A+ setup confirmed`;

    }


    return {

        direction,

        score,

        approved,

        reason,

        directionOK,

        structureOK,

        emaOK,

        rsiOK,

        rsiProtectionOK:
            rsiProtection.valid,

        momentumOK,

        candleOK,

        extensionOK:
            extension.valid,

        sessionOK,

        srOK,

        newsOK,

        slOK,

        rrOK,

        reversalOK:
            reversal.valid,

        reversalType:
            reversal.type,

        entry:
            price,

        sl,

        tp1:
            rrData.tp1,

        tp2:
            rrData.tp2,

        rr:
            rrData.rr

    };

}


/* =========================================================
   ENGINE 3 RUNNER
   ========================================================= */

function runEngine3() {

    MarketState.supportResistance =
        calculateSupportResistance(
            MarketState.candles.M5
        );


    const buy =
        evaluateTradeGate("BUY");

    const sell =
        evaluateTradeGate("SELL");


    MarketState.engine3.buy =
        buy;

    MarketState.engine3.sell =
        sell;


    /*
       No ranking between BUY and SELL.

       Only approve a direction if that
       direction independently satisfies
       the A+ gate.
    */

    if (buy.approved) {

        MarketState.engine3.direction =
            "BUY";

        MarketState.engine3.score =
            buy.score;

        MarketState.engine3.decision =
            "BUY";

        MarketState.engine3.reason =
            buy.reason;

        displayEngine3(buy);

        return;

    }


    if (sell.approved) {

        MarketState.engine3.direction =
            "SELL";

        MarketState.engine3.score =
            sell.score;

        MarketState.engine3.decision =
            "SELL";

        MarketState.engine3.reason =
            sell.reason;

        displayEngine3(sell);

        return;

    }


    MarketState.engine3.direction =
        null;

    MarketState.engine3.score =
        Math.max(
            buy.score || 0,
            sell.score || 0
        );

    MarketState.engine3.decision =
        "WAIT";

    MarketState.engine3.reason =
        "A+ setup not confirmed";


    displayEngine3(
        buy.score >= sell.score
            ? buy
            : sell
    );

}


/* =========================================================
   ENGINE 3 DISPLAY
   ========================================================= */

function setCheck(
    iconId,
    statusId,
    valid,
    status
) {

    setText(
        iconId,
        valid ? "✓" : "○"
    );

    setText(
        statusId,
        status
    );

}


function displayEngine3(result) {

    if (!result) return;


    setText(
        "decision",
        MarketState.engine3.decision
    );

    setText(
        "decisionReason",
        MarketState.engine3.reason
    );

    setText(
        "score",
        `${result.score || 0} / 10`
    );


    const scoreFill =
        $("scoreFill");

    if (scoreFill) {

        const percentage =
            clamp(
                ((result.score || 0) / 10) *
                    100,
                0,
                100
            );

        scoreFill.style.width =
            `${percentage}%`;

    }


    setCheck(

        "checkDirectionIcon",

        "checkDirectionStatus",

        result.directionOK,

        result.directionOK
            ? "CONFIRMED"
            : "NOT ALIGNED"

    );


    setCheck(

        "checkStructureIcon",

        "checkStructureStatus",

        result.structureOK,

        result.structureOK
            ? "CONFIRMED"
            : "NOT ALIGNED"

    );


    setCheck(

        "checkEmaIcon",

        "checkEmaStatus",

        result.emaOK,

        result.emaOK
            ? "EMA ALIGNED"
            : "EMA MISALIGNED"

    );


    setCheck(

        "checkRsiIcon",

        "checkRsiStatus",

        result.rsiOK,

        result.rsiOK
            ? "RSI IN TRADE ZONE"
            : "RSI OUTSIDE ZONE"

    );


    setCheck(

        "checkRsiProtectionIcon",

        "checkRsiProtectionStatus",

        result.rsiProtectionOK,

        result.rsiProtectionOK
            ? "PROTECTION PASSED"
            : "PROTECTION BLOCK"

    );


    setCheck(

        "checkMomentumIcon",

        "checkMomentumStatus",

        result.momentumOK,

        result.momentumOK
            ? "MOMENTUM CONFIRMED"
            : "MOMENTUM AGAINST TRADE"

    );


    setCheck(

        "checkCandleIcon",

        "checkCandleStatus",

        result.candleOK,

        result.candleOK
            ? "STRONG CANDLE"
            : "WEAK CANDLE"

    );


    setCheck(

        "checkExtensionIcon",

        "checkExtensionStatus",

        result.extensionOK,

        result.extensionOK
            ? "NOT OVEREXTENDED"
            : "EXTENDED — WAIT"

    );


    setText(
        "checkSessionStatus",
        getTradingSession()
    );


    setCheck(

        "checkSrIcon",

        "checkSrStatus",

        result.srOK,

        result.srOK
            ? "ZONE VALID"
            : "NEAR OPPOSING ZONE"

    );


    setCheck(

        "checkNewsIcon",

        "checkNewsStatus",

        result.newsOK,

        result.newsOK
            ? "NEWS CLEAR"
            : "NEWS NOT CONFIRMED"

    );


    setCheck(

        "checkSlIcon",

        "checkSlStatus",

        result.slOK,

        result.slOK
            ? "STRUCTURAL SL VALID"
            : "SL INVALID"

    );


    setCheck(

        "checkRrIcon",

        "checkRrStatus",

        result.rrOK,

        result.rrOK
            ? `R:R ${formatNumber(result.rr, 2)}`
            : "R:R BELOW 1:2"

    );


    setCheck(

        "checkReversalIcon",

        "checkReversalStatus",

        result.reversalOK,

        result.reversalOK
            ? result.reversalType
            : "NO A+ REVERSAL"

    );


    setText(
        "riskEntry",
        result.entry
            ? formatPrice(result.entry)
            : "—"
    );

    setText(
        "riskSl",
        result.sl
            ? formatPrice(result.sl)
            : "—"
    );

    setText(
        "riskTp1",
        result.tp1
            ? formatPrice(result.tp1)
            : "—"
    );

    setText(
        "riskTp2",
        result.tp2
            ? formatPrice(result.tp2)
            : "—"
    );

    setText(
        "riskRr",
        result.rr !== null
            ? `1:${formatNumber(result.rr, 2)}`
            : "—"
    );

}


/* =========================================================
   UPDATE MAIN DASHBOARD
   ========================================================= */

function updateDashboard() {

    const price =
        MarketState.livePrice;


    setText(
        "price",
        price
            ? formatPrice(price)
            : "—"
    );


    setText(
        "chartPrice",
        price
            ? formatPrice(price)
            : "—"
    );


    setText(
        "session",
        getTradingSession()
    );


    updateTimeframeDisplay(
        "H4",
        MarketState.analysis.H4
    );

    updateTimeframeDisplay(
        "H1",
        MarketState.analysis.H1
    );

    updateTimeframeDisplay(
        "M15",
        MarketState.analysis.M15
    );

    updateTimeframeDisplay(
        "M5",
        MarketState.analysis.M5
    );


    const m5 =
        MarketState.indicators.M5;


    setText(
        "ema20",
        formatPrice(m5.ema20)
    );

    setText(
        "ema50",
        formatPrice(m5.ema50)
    );

    setText(
        "ema200",
        formatPrice(m5.ema200)
    );


    setText(
        "rsi",
        m5.rsi !== undefined &&
        m5.rsi !== null
            ? formatNumber(
                m5.rsi,
                2
            )
            : "—"
    );


    setText(
        "momentum",
        m5.momentum !== undefined &&
        m5.momentum !== null
            ? formatNumber(
                m5.momentum,
                5
            )
            : "—"
    );


    setText(
        "candleQuality",
        m5.candleQuality
            ? (
                m5.candleQuality.strong
                    ? "STRONG"
                    : "WEAK"
            )
            : "—"
    );


    const extension =
        checkEMAExtension(
            price,
            m5
        );


    setText(
        "emaExtension",
        extension.status
    );


    updateSupportResistance();

}


/* =========================================================
   TIMEFRAME DISPLAY
   ========================================================= */

function updateTimeframeDisplay(
    timeframe,
    analysis
) {

    if (
        !analysis ||
        !analysis.direction
    ) {

        return;

    }


    setText(
        `${timeframe.toLowerCase()}Direction`,
        analysis.direction
    );


    /*
       Current HTML uses separate IDs for
       H4/H1/M15/M5 cards in the dashboard.

       We update the known generic IDs when present.
    */

    setText(
        `${timeframe.toLowerCase()}Structure`,
        analysis.structure
    );


    if (timeframe === "H4") {

        setText(
            "h4Direction",
            analysis.direction
        );

        setText(
            "h4Structure",
            analysis.structure
        );

        setText(
            "h4SwingHigh",
            formatPrice(
                analysis.swingHigh
            )
        );

        setText(
            "h4SwingLow",
            formatPrice(
                analysis.swingLow
            )
        );

    }


    if (timeframe === "H1") {

        setText(
            "h1Direction",
            analysis.direction
        );

        setText(
            "h1Structure",
            analysis.structure
        );

        setText(
            "h1SwingHigh",
            formatPrice(
                analysis.swingHigh
            )
        );

        setText(
            "h1SwingLow",
            formatPrice(
                analysis.swingLow
            )
        );

    }


    if (timeframe === "M15") {

        setText(
            "m15Structure",
            analysis.structure
        );

        setText(
            "m15Trend",
            analysis.direction
        );

        setText(
            "m15EmaAlignment",
            getEMAAlignment(
                MarketState.indicators.M15
            )
        );

    }


    if (timeframe === "M5") {

        setText(
            "m5Structure",
            analysis.structure
        );

        setText(
            "m5Ema",
            getEMAAlignment(
                MarketState.indicators.M5
            )
        );

        setText(
            "m5Rsi",
            formatNumber(
                MarketState.indicators.M5.rsi,
                2
            )
        );

    }

}


/* =========================================================
   EMA ALIGNMENT DISPLAY
   ========================================================= */

function getEMAAlignment(
    indicators
) {

    if (
        !indicators ||
        indicators.ema20 === null ||
        indicators.ema50 === null ||
        indicators.ema200 === null
    ) {

        return "WAITING";

    }

    if (
        indicators.ema20 >
        indicators.ema50 &&
        indicators.ema50 >
        indicators.ema200
    ) {

        return "BULLISH";

    }

    if (
        indicators.ema20 <
        indicators.ema50 &&
        indicators.ema50 <
        indicators.ema200
    ) {

        return "BEARISH";

    }

    return "MIXED";

}


/* =========================================================
   SUPPORT / RESISTANCE DISPLAY
   ========================================================= */

function updateSupportResistance() {

    const sr =
        MarketState.supportResistance;

    setText(
        "resistance1",
        formatPrice(
            sr.resistance1
        )
    );

    setText(
        "resistance2",
        formatPrice(
            sr.resistance2
        )
    );

    setText(
        "srPrice",
        formatPrice(
            MarketState.livePrice
        )
    );

    setText(
        "support1",
        formatPrice(
            sr.support1
        )
    );

    setText(
        "support2",
        formatPrice(
            sr.support2
        )
    );

}


/* =========================================================
   CHART INITIALIZATION
   ========================================================= */

function initializeChart() {

    const container =
        $("chartArea");

    if (
        !container ||
        typeof LightweightCharts ===
            "undefined"
    ) {

        console.warn(
            "Lightweight Charts unavailable"
        );

        return false;

    }


    if (
        ChartState.initialized
    ) {

        return true;

    }


    try {

        ChartState.chart =
            LightweightCharts.createChart(

                container,

                {

                    autoSize: true,

                    layout: {

                        background: {
                            color: "#071522"
                        },

                        textColor: "#d9e7f2"

                    },

                    grid: {

                        vertLines: {
                            color: "#102535"
                        },

                        horzLines: {
                            color: "#102535"
                        }

                    },

                    rightPriceScale: {

                        borderColor:
                            "#203746"

                    },

                    timeScale: {

                        borderColor:
                            "#203746",

                        timeVisible: true,

                        secondsVisible:
                            false

                    }

                }

            );


        ChartState.candleSeries =
            ChartState.chart.addSeries(

                LightweightCharts.CandlestickSeries,

                {

                    upColor: "#26a69a",

                    downColor: "#ef5350",

                    borderVisible: false,

                    wickUpColor: "#26a69a",

                    wickDownColor: "#ef5350"

                }

            );


        ChartState.ema20Series =
            ChartState.chart.addSeries(

                LightweightCharts.LineSeries,

                {

                    lineWidth: 1,

                    color: "#ffffff"

                }

            );


        ChartState.ema50Series =
            ChartState.chart.addSeries(

                LightweightCharts.LineSeries,

                {

                    lineWidth: 1,

                    color: "#00bcd4"

                }

            );


        ChartState.ema200Series =
            ChartState.chart.addSeries(

                LightweightCharts.LineSeries,

                {

                    lineWidth: 2,

                    color: "#ff9800"

                }

            );


        ChartState.initialized =
            true;

        return true;

    } catch (error) {

        console.error(
            "Chart initialization failed:",
            error
        );

        return false;

    }

}


/* =========================================================
   CANDLE TIME CONVERSION
   ========================================================= */

function convertCandleTime(
    datetime
) {

    if (
        datetime === undefined ||
        datetime === null
    ) {

        return null;

    }

    let text =
        String(datetime).trim();


    /*
       Twelve Data can return:
       YYYY-MM-DD HH:MM:SS

       Convert it to ISO UTC.
    */

    if (
        !text.includes("T") &&
        !text.endsWith("Z")
    ) {

        text =
            text.replace(
                " ",
                "T"
            ) + "Z";

    }


    const timestamp =
        Math.floor(
            Date.parse(text) / 1000
        );


    return Number.isFinite(timestamp)
        ? timestamp
        : null;

}


/* =========================================================
   REMOVE DUPLICATE CHART TIMES
   ========================================================= */

function prepareChartData(
    candles
) {

    const output = [];

    const used =
        new Set();

    for (
        const candle of candles
    ) {

        const time =
            convertCandleTime(
                candle.datetime
            );

        if (!time) continue;

        if (
            used.has(time)
        ) {

            continue;

        }

        used.add(time);

        output.push({

            time,

            open:
                candle.open,

            high:
                candle.high,

            low:
                candle.low,

            close:
                candle.close

        });

    }

    output.sort(
        (a, b) =>
            a.time - b.time
    );

    return output;

}


/* =========================================================
   PREPARE EMA DATA
   ========================================================= */

function prepareEMAData(
    candles,
    emaValues
) {

    const output = [];

    const used =
        new Set();

    for (
        let i = 0;
        i < candles.length;
        i++
    ) {

        const ema =
            emaValues[i];

        if (
            ema === undefined ||
            ema === null
        ) {

            continue;

        }

        const time =
            convertCandleTime(
                candles[i].datetime
            );

        if (!time) continue;

        if (
            used.has(time)
        ) {

            continue;

        }

        used.add(time);

        output.push({

            time,

            value: ema

        });

    }

    output.sort(
        (a, b) =>
            a.time - b.time
    );

    return output;

}


/* =========================================================
   UPDATE FINANCIAL CHART
   ========================================================= */

function updateFinancialChart(
    m5Loaded
) {

    const message =
        $("chartMessage");

    const messageText =
        $("chartMessageText");

    if (
        !initializeChart()
    ) {

        return;

    }


    const candles =
        MarketState.candles.M5;


    if (
        !m5Loaded ||
        !candles ||
        candles.length < 20
    ) {

        if (message) {

            message.style.display =
                "flex";

        }

        setText(
            "chartState",
            "M5 DATA WAITING"
        );

        if (messageText) {

            messageText.textContent =
                "Waiting for real EUR/USD candle data";

        }

        return;

    }


    const chartData =
        prepareChartData(
            candles
        );


    if (
        chartData.length < 20
    ) {

        if (message) {

            message.style.display =
                "flex";

        }

        setText(
            "chartState",
            "CANDLE FORMAT ERROR"
        );

        return;

    }


    try {

        ChartState.candleSeries.setData(
            chartData
        );


        const indicators =
            MarketState.indicators.M5;


        ChartState.ema20Series.setData(

            prepareEMAData(

                candles,

                indicators.ema20Series

            )

        );


        ChartState.ema50Series.setData(

            prepareEMAData(

                candles,

                indicators.ema50Series

            )

        );


        ChartState.ema200Series.setData(

            prepareEMAData(

                candles,

                indicators.ema200Series

            )

        );


        /*
           Move the visible chart
           to the latest market candles.
        */

        ChartState.chart
            .timeScale()
            .fitContent();


        if (message) {

            message.style.display =
                "none";

        }


        setText(
            "chartState",
            "M5 • LIVE DATA"
        );


    } catch (error) {

        console.error(
            "Chart update failed:",
            error
        );

        if (message) {

            message.style.display =
                "flex";

        }

        setText(
            "chartState",
            "CHART ERROR"
        );

    }

}


/* =========================================================
   NEWS STATUS
   ========================================================= */

function initializeNewsStatus() {

    /*
       Until a real economic calendar
       is connected, news remains UNKNOWN.

       Engine 3 therefore cannot approve
       an A+ trade.
    */

    MarketState.news.status =
        "UNKNOWN";

    setText(
        "newsCalendar",
        "WAITING"
    );

    setText(
        "eurEvents",
        "—"
    );

    setText(
        "usdEvents",
        "—"
    );

    setText(
        "highImpactNews",
        "—"
    );

}


/* =========================================================
   MANUAL BUY ANALYSIS
   ========================================================= */

function analyzeBuy() {

    const result =
        evaluateTradeGate(
            "BUY"
        );

    displayEngine3(
        result
    );

}


/* =========================================================
   MANUAL SELL ANALYSIS
   ========================================================= */

function analyzeSell() {

    const result =
        evaluateTradeGate(
            "SELL"
        );

    displayEngine3(
        result
    );

}


/* =========================================================
   REFRESH
   ========================================================= */

async function refreshDashboard() {

    await loadMarketData();

}


/* =========================================================
   ALERT
   ========================================================= */

function setAlert() {

    if (
        "Notification" in window
    ) {

        if (
            Notification.permission ===
            "default"
        ) {

            Notification.requestPermission();

        }

    }

    alert(
        "EUR/USD alert feature ready."
    );

}


/* =========================================================
   CHART TABS
   ========================================================= */

function setupChartTabs() {

    const tabs = [

        {
            id: "tabH4",
            timeframe: "H4"
        },

        {
            id: "tabH1",
            timeframe: "H1"
        },

        {
            id: "tabM15",
            timeframe: "M15"
        },

        {
            id: "tabM5",
            timeframe: "M5"
        }

    ];


    tabs.forEach(tab => {

        const element =
            $(tab.id);

        if (!element) return;


        element.addEventListener(
            "click",
            () => {

                tabs.forEach(
                    item => {

                        const el =
                            $(item.id);

                        if (el) {

                            el.classList.remove(
                                "active"
                            );

                        }

                    }
                );


                element.classList.add(
                    "active"
                );


                /*
                   Current chart is M5.

                   The tabs are prepared for
                   future multi-timeframe chart
                   switching.

                   We do NOT show fake data.
                */

                if (
                    tab.timeframe ===
                    "M5"
                ) {

                    updateFinancialChart(
                        MarketState.candles.M5.length > 0
                    );

                } else {

                    const timeframeData =
                        MarketState.candles[
                            tab.timeframe
                        ];

                    if (
                        timeframeData &&
                        timeframeData.length
                    ) {

                        /*
                           For now the main
                           financial chart remains
                           the live M5 chart.
                        */

                        setText(
                            "chartState",
                            `${tab.timeframe} DATA READY`
                        );

                    } else {

                        setText(
                            "chartState",
                            `${tab.timeframe} DATA WAITING`
                        );

                    }

                }

            }
        );

    });

}


/* =========================================================
   GLOBAL FUNCTIONS
   ========================================================= */

window.refreshDashboard =
    refreshDashboard;

window.analyzeBuy =
    analyzeBuy;

window.analyzeSell =
    analyzeSell;

window.setAlert =
    setAlert;


/* =========================================================
   INITIALIZATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        initializeNewsStatus();

        setupChartTabs();

        initializeChart();

        setText(
            "chartState",
            "DATA: CONNECTING"
        );

        setText(
            "trend",
            "Connecting to Twelve Data..."
        );


        await loadMarketData();


        setInterval(
            loadMarketData,
            AUTO_REFRESH_MS
        );

    }
);
