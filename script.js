/* =========================================================
   EUR/USD SNIPER DASHBOARD
   FULL MARKET + ENGINE SYSTEM
   + LIVE M5 FINANCIAL CHART
   + EMA 20 / 50 / 200
   ========================================================= */


/* =========================================================
   CONFIGURATION
   ========================================================= */

const TWELVE_DATA_API_KEY = "53821bf38bec40e4a88bd1fa06ac32b3";

const TWELVE_DATA_BASE = "https://api.twelvedata.com";

const PAIR = "EUR/USD";

const AUTO_REFRESH_MS = 30000;


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

        EMA20: null,
        EMA50: null,
        EMA200: null,

        RSI14: null,

        momentum: null,

        ATR14: null
    },

    connected: false,

    lastUpdate: null,

    news: {

        status: "UNKNOWN",
        blocked: false,
        events: []
    },

    session: {

        name: "UNKNOWN",
        active: false,
        context: ""
    },

    engine1: null,

    engine2: null,

    engine3: null
};


/* =========================================================
   ENGINE 3 CONFIGURATION
   ========================================================= */

const Engine3Config = {

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

    REQUIRED_SCORE: 8,

    NEWS_BLOCKER: true
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

    livePriceLine: null,

    initialized: false
};


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function setText(id, value) {

    const el = document.getElementById(id);

    if (el) {

        el.textContent =
            value === null ||
            value === undefined
                ? "—"
                : value;
    }
}


function finite(value) {

    return Number.isFinite(Number(value));
}


function formatPrice(value) {

    if (!finite(value)) {

        return "—";
    }

    return Number(value).toFixed(5);
}


/* =========================================================
   PRICE DISPLAY
   ========================================================= */

function updatePriceDisplay() {

    const price = MarketState.livePrice;

    if (!finite(price)) {

        setText("livePrice", "—");

        setText("chartPrice", "—");

        setText("srPrice", "—");

        return;
    }

    const formatted = formatPrice(price);

    setText("livePrice", formatted);

    setText("chartPrice", formatted);

    setText("srPrice", formatted);
}


/* =========================================================
   DATA STATUS
   ========================================================= */

function updateDataStatus() {

    const connected = MarketState.connected;

    setText(
        "chartState",
        connected
            ? "DATA: LIVE"
            : "DATA: ERROR"
    );
}


function updateM5Status() {

    const candles = MarketState.candles.M5;

    if (!candles || !candles.length) {

        setText("candleStatus", "WAITING");

        return;
    }

    setText(
        "candleStatus",
        `${candles.length} CANDLES`
    );
}


/* =========================================================
   EMA CALCULATION
   ========================================================= */

function calculateEMA(values, period) {

    if (!Array.isArray(values) || values.length < period) {

        return null;
    }

    const multiplier = 2 / (period + 1);

    let ema = 0;

    for (let i = 0; i < period; i++) {

        ema += Number(values[i]);
    }

    ema /= period;

    for (let i = period; i < values.length; i++) {

        ema =
            (Number(values[i]) - ema) *
            multiplier +
            ema;
    }

    return ema;
}


/* =========================================================
   EMA SERIES FOR CHART
   ========================================================= */

function calculateEMASeries(candles, period) {

    if (!Array.isArray(candles) ||
        candles.length < period) {

        return [];
    }

    const result = [];

    const multiplier = 2 / (period + 1);

    let ema = 0;

    for (let i = 0; i < period; i++) {

        ema += Number(candles[i].close);
    }

    ema /= period;

    result.push({

        time: candles[period - 1].chartTime,

        value: ema
    });


    for (let i = period; i < candles.length; i++) {

        ema =
            (Number(candles[i].close) - ema) *
            multiplier +
            ema;

        result.push({

            time: candles[i].chartTime,

            value: ema
        });
    }

    return result;
}


/* =========================================================
   RSI
   ========================================================= */

function calculateRSI(values, period = 14) {

    if (!Array.isArray(values) ||
        values.length <= period) {

        return null;
    }

    let gains = 0;

    let losses = 0;

    for (let i = 1; i <= period; i++) {

        const difference =
            Number(values[i]) -
            Number(values[i - 1]);

        if (difference >= 0) {

            gains += difference;

        } else {

            losses += Math.abs(difference);
        }
    }

    let averageGain =
        gains / period;

    let averageLoss =
        losses / period;


    for (let i = period + 1; i < values.length; i++) {

        const difference =
            Number(values[i]) -
            Number(values[i - 1]);

        const gain =
            difference > 0
                ? difference
                : 0;

        const loss =
            difference < 0
                ? Math.abs(difference)
                : 0;

        averageGain =
            ((averageGain * (period - 1)) + gain)
            / period;

        averageLoss =
            ((averageLoss * (period - 1)) + loss)
            / period;
    }


    if (averageLoss === 0) {

        return 100;
    }

    const relativeStrength =
        averageGain / averageLoss;

    return 100 -
        (100 / (1 + relativeStrength));
}


/* =========================================================
   ATR
   ========================================================= */

function calculateATR(candles, period = 14) {

    if (!Array.isArray(candles) ||
        candles.length <= period) {

        return null;
    }

    const trueRanges = [];

    for (let i = 1; i < candles.length; i++) {

        const current = candles[i];

        const previous = candles[i - 1];

        const range1 =
            current.high -
            current.low;

        const range2 =
            Math.abs(
                current.high -
                previous.close
            );

        const range3 =
            Math.abs(
                current.low -
                previous.close
            );

        trueRanges.push(
            Math.max(
                range1,
                range2,
                range3
            )
        );
    }

    if (trueRanges.length < period) {

        return null;
    }

    let atr = 0;

    for (let i = 0; i < period; i++) {

        atr += trueRanges[i];
    }

    atr /= period;


    for (
        let i = period;
        i < trueRanges.length;
        i++
    ) {

        atr =
            ((atr * (period - 1)) +
            trueRanges[i]) /
            period;
    }

    return atr;
}


/* =========================================================
   MOMENTUM
   ========================================================= */

function calculateMomentum(
    values,
    lookback = 5
) {

    if (!Array.isArray(values) ||
        values.length <= lookback) {

        return null;
    }

    const current =
        Number(values[values.length - 1]);

    const previous =
        Number(
            values[
                values.length - 1 - lookback
            ]
        );

    if (!finite(current) ||
        !finite(previous)) {

        return null;
    }

    return current - previous;
}


/* =========================================================
   CANDLE DIRECTION
   ========================================================= */

function getCandleDirection(candle) {

    if (!candle) {

        return "UNKNOWN";
    }

    if (candle.close > candle.open) {

        return "BULLISH";
    }

    if (candle.close < candle.open) {

        return "BEARISH";
    }

    return "NEUTRAL";
}


/* =========================================================
   CANDLE QUALITY
   ========================================================= */

function evaluateCandleQuality(candle) {

    if (!candle) {

        return {

            valid: false,

            quality: "UNAVAILABLE",

            score: 0
        };
    }

    const range =
        candle.high -
        candle.low;

    if (range <= 0) {

        return {

            valid: false,

            quality: "INVALID",

            score: 0
        };
    }

    const body =
        Math.abs(
            candle.close -
            candle.open
        );

    const bodyRatio =
        body / range;

    const upperWick =
        candle.high -
        Math.max(
            candle.open,
            candle.close
        );

    const lowerWick =
        Math.min(
            candle.open,
            candle.close
        ) -
        candle.low;


    if (bodyRatio >= 0.70) {

        return {

            valid: true,

            quality: "STRONG",

            score: 2
        };
    }

    if (bodyRatio >= 0.45) {

        return {

            valid: true,

            quality: "GOOD",

            score: 1
        };
    }

    if (
        upperWick > body * 2 ||
        lowerWick > body * 2
    ) {

        return {

            valid: true,

            quality: "REJECTION",

            score: 1
        };
    }

    return {

        valid: false,

        quality: "WEAK",

        score: 0
    };
}


/* =========================================================
   EMA ALIGNMENT
   ========================================================= */

function evaluateEMAAlignment(
    ema20,
    ema50,
    ema200,
    direction
) {

    if (
        !finite(ema20) ||
        !finite(ema50) ||
        !finite(ema200)
    ) {

        return {

            valid: false,

            status: "EMA DATA UNAVAILABLE"
        };
    }


    if (direction === "BUY") {

        return {

            valid:
                ema20 > ema50 &&
                ema50 > ema200,

            status:
                ema20 > ema50 &&
                ema50 > ema200
                    ? "BULLISH ALIGNMENT"
                    : "NOT ALIGNED"
        };
    }


    if (direction === "SELL") {

        return {

            valid:
                ema20 < ema50 &&
                ema50 < ema200,

            status:
                ema20 < ema50 &&
                ema50 < ema200
                    ? "BEARISH ALIGNMENT"
                    : "NOT ALIGNED"
        };
    }


    return {

        valid: false,

        status: "NO DIRECTION"
    };
}


/* =========================================================
   TIMEFRAME DIRECTION
   ========================================================= */

function getTimeframeDirection(candles) {

    if (!candles ||
        candles.length < 20) {

        return "UNKNOWN";
    }

    const closes =
        candles.map(c => c.close);

    const ema20 =
        calculateEMA(closes, 20);

    const last =
        closes[closes.length - 1];

    if (!finite(ema20) ||
        !finite(last)) {

        return "UNKNOWN";
    }

    if (last > ema20) {

        return "BUY";
    }

    if (last < ema20) {

        return "SELL";
    }

    return "NEUTRAL";
}


/* =========================================================
   HIGHER TIMEFRAME AGREEMENT
   ========================================================= */

function evaluateHigherTimeframeAgreement() {

    const h4 =
        getTimeframeDirection(
            MarketState.candles.H4
        );

    const h1 =
        getTimeframeDirection(
            MarketState.candles.H1
        );

    return {

        h4,

        h1,

        valid:
            h4 !== "UNKNOWN" &&
            h1 !== "UNKNOWN" &&
            h4 === h1
    };
}


/* =========================================================
   SWING DETECTION
   ========================================================= */

function isSwingHigh(
    candles,
    index,
    lookback = 2
) {

    const current =
        candles[index].high;

    for (
        let i = index - lookback;
        i <= index + lookback;
        i++
    ) {

        if (
            i < 0 ||
            i >= candles.length ||
            i === index
        ) {
            continue;
        }

        if (
            candles[i].high >= current
        ) {

            return false;
        }
    }

    return true;
}


function isSwingLow(
    candles,
    index,
    lookback = 2
) {

    const current =
        candles[index].low;

    for (
        let i = index - lookback;
        i <= index + lookback;
        i++
    ) {

        if (
            i < 0 ||
            i >= candles.length ||
            i === index
        ) {
            continue;
        }

        if (
            candles[i].low <= current
        ) {

            return false;
        }
    }

    return true;
}


/* =========================================================
   FIND SWINGS
   ========================================================= */

function findSwings(
    candles,
    lookback = 2
) {

    const highs = [];

    const lows = [];

    for (
        let i = lookback;
        i < candles.length - lookback;
        i++
    ) {

        if (
            isSwingHigh(
                candles,
                i,
                lookback
            )
        ) {

            highs.push({

                index: i,

                price:
                    candles[i].high
            });
        }


        if (
            isSwingLow(
                candles,
                i,
                lookback
            )
        ) {

            lows.push({

                index: i,

                price:
                    candles[i].low
            });
        }
    }

    return {

        highs,

        lows
    };
}


/* =========================================================
   MARKET STRUCTURE
   ========================================================= */

function evaluateStructure(
    candles
) {

    if (
        !Array.isArray(candles) ||
        candles.length < 10
    ) {

        return {

            direction: "UNKNOWN",

            status: "STRUCTURE DATA UNAVAILABLE",

            valid: false,

            swingHigh: null,

            swingLow: null
        };
    }


    const swings =
        findSwings(
            candles,
            Engine3Config.SWING_LOOKBACK
        );


    const highs =
        swings.highs.slice(-3);

    const lows =
        swings.lows.slice(-3);


    if (
        highs.length < 2 ||
        lows.length < 2
    ) {

        return {

            direction: "UNKNOWN",

            status: "WAITING FOR SWINGS",

            valid: false,

            swingHigh:
                highs.length
                    ? highs[highs.length - 1].price
                    : null,

            swingLow:
                lows.length
                    ? lows[lows.length - 1].price
                    : null
        };
    }


    const lastHigh =
        highs[highs.length - 1].price;

    const previousHigh =
        highs[highs.length - 2].price;

    const lastLow =
        lows[lows.length - 1].price;

    const previousLow =
        lows[lows.length - 2].price;


    const bullish =
        lastHigh > previousHigh &&
        lastLow > previousLow;


    const bearish =
        lastHigh < previousHigh &&
        lastLow < previousLow;


    if (bullish) {

        return {

            direction: "BUY",

            status: "BULLISH STRUCTURE",

            valid: true,

            swingHigh: lastHigh,

            swingLow: lastLow
        };
    }


    if (bearish) {

        return {

            direction: "SELL",

            status: "BEARISH STRUCTURE",

            valid: true,

            swingHigh: lastHigh,

            swingLow: lastLow
        };
    }


    return {

        direction: "NEUTRAL",

        status: "MIXED STRUCTURE",

        valid: false,

        swingHigh: lastHigh,

        swingLow: lastLow
    };
}


/* =========================================================
   MULTI-TIMEFRAME STRUCTURE
   ========================================================= */

function evaluateMultiTimeframeStructure() {

    const m15 =
        evaluateStructure(
            MarketState.candles.M15
        );

    const m5 =
        evaluateStructure(
            MarketState.candles.M5
        );

    return {

        m15,

        m5,

        valid:
            m15.valid &&
            m5.valid &&
            m15.direction === m5.direction
    };
}


/* =========================================================
   MOMENTUM EVALUATION
   ========================================================= */

function evaluateMomentum(
    candles,
    direction
) {

    if (!candles ||
        candles.length <=
        Engine3Config.MOMENTUM_LOOKBACK) {

        return {

            valid: false,

            status: "MOMENTUM UNAVAILABLE",

            momentum: null
        };
    }


    const closes =
        candles.map(c => c.close);

    const momentum =
        calculateMomentum(
            closes,
            Engine3Config.MOMENTUM_LOOKBACK
        );


    if (!finite(momentum)) {

        return {

            valid: false,

            status: "MOMENTUM UNAVAILABLE",

            momentum: null
        };
    }


    if (direction === "BUY") {

        return {

            valid: momentum > 0,

            status:
                momentum > 0
                    ? "BULLISH"
                    : "BEARISH",

            momentum
        };
    }


    if (direction === "SELL") {

        return {

            valid: momentum < 0,

            status:
                momentum < 0
                    ? "BEARISH"
                    : "BULLISH",

            momentum
        };
    }


    return {

        valid: false,

        status: "NO DIRECTION",

        momentum
    };
}


/* =========================================================
   ELITE RSI PROTECTION
   ========================================================= */

function getEliteRSIProtection(
    rsi,
    direction
) {

    if (
        rsi === null ||
        !Number.isFinite(rsi)
    ) {

        return {

            valid: false,

            status: "RSI DATA UNAVAILABLE",

            reason: "RSI data unavailable"
        };
    }


    /*
       HARD PROTECTION

       BUY:
       Do not chase extreme overbought RSI.

       SELL:
       Do not chase extreme oversold RSI.
    */


    if (
        direction === "BUY" &&
        rsi >= Engine3Config.RSI_OVERBOUGHT
    ) {

        return {

            valid: false,

            status: "BUY BLOCKED — OVERBOUGHT",

            reason:
                "RSI is too high for a fresh BUY"
        };
    }


    if (
        direction === "SELL" &&
        rsi <= Engine3Config.RSI_OVERSOLD
    ) {

        return {

            valid: false,

            status: "SELL BLOCKED — OVERSOLD",

            reason:
                "RSI is too low for a fresh SELL"
        };
    }


    if (direction === "BUY") {

        const valid =
            rsi >= Engine3Config.RSI_BUY_MIN &&
            rsi <= Engine3Config.RSI_BUY_MAX;

        return {

            valid,

            status:
                valid
                    ? "BUY RSI SAFE"
                    : "BUY RSI WEAK",

            reason:
                valid
                    ? "RSI within BUY safety zone"
                    : "RSI outside BUY safety zone"
        };
    }


    if (direction === "SELL") {

        const valid =
            rsi >= Engine3Config.RSI_SELL_MIN &&
            rsi <= Engine3Config.RSI_SELL_MAX;

        return {

            valid,

            status:
                valid
                    ? "SELL RSI SAFE"
                    : "SELL RSI WEAK",

            reason:
                valid
                    ? "RSI within SELL safety zone"
                    : "RSI outside SELL safety zone"
        };
    }


    return {

        valid: false,

        status: "NO DIRECTION",

        reason: "No trade direction"
    };
}


/* =========================================================
   A+ REVERSAL
   ========================================================= */

function detectAPlusReversal(
    candles,
    rsi,
    direction
) {

    if (
        !candles ||
        candles.length < 5 ||
        !finite(rsi)
    ) {

        return {

            valid: false,

            status: "NO REVERSAL"
        };
    }


    const last =
        candles[candles.length - 1];

    const previous =
        candles[candles.length - 2];


    const bullishRejection =
        last.close > last.open &&
        last.low < previous.low &&
        last.close >
            (
                last.low +
                (last.high - last.low) * 0.60
            );


    const bearishRejection =
        last.close < last.open &&
        last.high > previous.high &&
        last.close <
            (
                last.high -
                (last.high - last.low) * 0.60
            );


    if (
        direction === "BUY" &&
        bullishRejection &&
        rsi < 45
    ) {

        return {

            valid: true,

            status: "A+ BULLISH REVERSAL"
        };
    }


    if (
        direction === "SELL" &&
        bearishRejection &&
        rsi > 55
    ) {

        return {

            valid: true,

            status: "A+ BEARISH REVERSAL"
        };
    }


    return {

        valid: false,

        status: "NO A+ REVERSAL"
    };
}


/* =========================================================
   EMA EXTENSION
   ========================================================= */

function evaluateEMAExtension(
    price,
    ema20,
    atr,
    direction
) {

    if (
        !finite(price) ||
        !finite(ema20) ||
        !finite(atr) ||
        atr <= 0
    ) {

        return {

            valid: false,

            status: "EMA EXTENSION DATA UNAVAILABLE"
        };
    }


    const distance =
        Math.abs(
            price - ema20
        );


    const extension =
        distance / atr;


    const tooExtended =
        extension >
        Engine3Config.EMA_EXTENSION_ATR;


    if (tooExtended) {

        return {

            valid: false,

            status:
                `EXTENDED ${extension.toFixed(2)} ATR`,

            extension
        };
    }


    return {

        valid: true,

        status:
            `NORMAL ${extension.toFixed(2)} ATR`,

        extension
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
        candles.length < 10
    ) {

        return {

            resistance1: null,

            resistance2: null,

            support1: null,

            support2: null
        };
    }


    const recent =
        candles.slice(
            -Engine3Config.SR_LOOKBACK
        );


    const highs =
        recent.map(c => c.high);

    const lows =
        recent.map(c => c.low);


    const sortedHighs =
        [...highs].sort(
            (a, b) => b - a
        );

    const sortedLows =
        [...lows].sort(
            (a, b) => a - b
        );


    return {

        resistance1:
            sortedHighs[0] || null,

        resistance2:
            sortedHighs[1] || null,

        support1:
            sortedLows[0] || null,

        support2:
            sortedLows[1] || null
    };
}


/* =========================================================
   S/R VALIDATION
   ========================================================= */

function evaluateSRValidation(
    price,
    sr,
    atr,
    direction
) {

    if (
        !finite(price) ||
        !sr ||
        !finite(atr)
    ) {

        return {

            valid: false,

            status: "S/R UNAVAILABLE"
        };
    }


    const zone =
        atr *
        Engine3Config.SR_ZONE_ATR;


    if (direction === "BUY") {

        if (
            finite(sr.support1) &&
            Math.abs(
                price - sr.support1
            ) <= zone
        ) {

            return {

                valid: true,

                status: "BUY NEAR SUPPORT"
            };
        }

        return {

            valid: true,

            status: "BUY — SUPPORT DISTANCE OK"
        };
    }


    if (direction === "SELL") {

        if (
            finite(sr.resistance1) &&
            Math.abs(
                price - sr.resistance1
            ) <= zone
        ) {

            return {

                valid: true,

                status: "SELL NEAR RESISTANCE"
            };
        }

        return {

            valid: true,

            status: "SELL — RESISTANCE DISTANCE OK"
        };
    }


    return {

        valid: false,

        status: "NO DIRECTION"
    };
}


/* =========================================================
   STRUCTURAL STOP LOSS
   ========================================================= */

function calculateStructuralSL(
    candles,
    direction,
    entry,
    atr
) {

    if (
        !candles ||
        candles.length < 5 ||
        !finite(entry)
    ) {

        return null;
    }


    const structure =
        evaluateStructure(candles);


    if (direction === "BUY") {

        let sl =
            structure.swingLow;


        if (!finite(sl)) {

            sl =
                entry -
                (atr || 0.0010);
        }


        if (sl >= entry) {

            sl =
                entry -
                (atr || 0.0010);
        }


        return sl;
    }


    if (direction === "SELL") {

        let sl =
            structure.swingHigh;


        if (!finite(sl)) {

            sl =
                entry +
                (atr || 0.0010);
        }


        if (sl <= entry) {

            sl =
                entry +
                (atr || 0.0010);
        }


        return sl;
    }


    return null;
}


/* =========================================================
   TRADE LEVELS
   ========================================================= */

function calculateTradeLevels(
    entry,
    sl,
    direction
) {

    if (
        !finite(entry) ||
        !finite(sl) ||
        !direction
    ) {

        return {

            valid: false,

            entry: null,

            sl: null,

            tp1: null,

            tp2: null,

            rr: null
        };
    }


    const risk =
        Math.abs(
            entry - sl
        );


    if (risk <= 0) {

        return {

            valid: false,

            entry,

            sl,

            tp1: null,

            tp2: null,

            rr: null
        };
    }


    let tp1;

    let tp2;


    if (direction === "BUY") {

        tp1 =
            entry +
            risk * 2;

        tp2 =
            entry +
            risk * 3;
    }


    else {

        tp1 =
            entry -
            risk * 2;

        tp2 =
            entry -
            risk * 3;
    }


    const rr =
        Math.abs(
            tp1 - entry
        ) / risk;


    return {

        valid:
            rr >= Engine3Config.MIN_RR,

        entry,

        sl,

        tp1,

        tp2,

        rr
    };
}


/* =========================================================
   TRADING SESSION
   ========================================================= */

function getTradingSession() {

    const now =
        new Date();


    const utcHour =
        now.getUTCHours();


    let name = "OFF / TRANSITION";

    let context =
        "Low-priority trading period";


    if (
        utcHour >= 7 &&
        utcHour < 12
    ) {

        name = "LONDON";

        context =
            "European liquidity";
    }


    else if (
        utcHour >= 12 &&
        utcHour < 16
    ) {

        name = "LONDON + NEW YORK";

        context =
            "Major overlap";
    }


    else if (
        utcHour >= 16 &&
        utcHour < 21
    ) {

        name = "NEW YORK";

        context =
            "US liquidity";
    }


    return {

        name,

        active:
            name !== "OFF / TRANSITION",

        context
    };
}


function updateSessionDisplay() {

    const session =
        getTradingSession();


    MarketState.session =
        session;


    setText(
        "session",
        session.name
    );
}


/* =========================================================
   NEWS BLOCKER
   ========================================================= */

function evaluateNewsBlocker() {

    /*
       IMPORTANT:

       No real economic-calendar API is connected yet.

       Therefore the dashboard MUST NOT pretend
       that news is clear.
    */

    MarketState.news.status =
        "UNKNOWN";

    MarketState.news.blocked =
        true;

    return {

        valid: false,

        status: "NEWS UNKNOWN",

        reason:
            "Real economic calendar not connected"
    };
}


/* =========================================================
   ENGINE 3 DIRECTION
   ========================================================= */

function determineEngine3Direction() {

    const higher =
        evaluateHigherTimeframeAgreement();


    if (!higher.valid) {

        return {

            direction: "WAIT",

            reason:
                "H4 + H1 direction not aligned"
        };
    }


    const structure =
        evaluateMultiTimeframeStructure();


    if (!structure.valid) {

        return {

            direction: "WAIT",

            reason:
                "M15 + M5 structure not aligned"
        };
    }


    return {

        direction:
            higher.h4,

        reason:
            "Higher timeframe direction aligned"
    };
}


/* =========================================================
   ENGINE 1
   ========================================================= */

function runEngine1() {

    const direction =
        determineEngine3Direction();


    return {

        status:
            direction.direction === "WAIT"
                ? "WAIT"
                : "ANALYSIS",

        direction:
            direction.direction,

        reason:
            "Engine 1 foundation active"
    };
}


/* =========================================================
   ENGINE 2
   ========================================================= */

function runEngine2() {

    const m5 =
        MarketState.candles.M5;


    if (!m5 || m5.length < 20) {

        return {

            status: "WAIT",

            direction: "WAIT",

            reason:
                "M5 data unavailable"
        };
    }


    const direction =
        getTimeframeDirection(m5);


    return {

        status:
            direction === "UNKNOWN"
                ? "WAIT"
                : "ANALYSIS",

        direction,

        reason:
            "Engine 2 scalp foundation active"
    };
}


/* =========================================================
   ENGINE 3 TRADE GATE
   ========================================================= */

function evaluateTradeGate() {

    const m5 =
        MarketState.candles.M5;


    if (!m5 || m5.length < 200) {

        return {

            decision: "WAIT",

            direction: "WAIT",

            score: 0,

            reason:
                "Not enough M5 data",

            valid: false
        };
    }


    const directionResult =
        determineEngine3Direction();


    const direction =
        directionResult.direction;


    if (
        direction !== "BUY" &&
        direction !== "SELL"
    ) {

        return {

            decision: "WAIT",

            direction: "WAIT",

            score: 0,

            reason:
                directionResult.reason,

            valid: false
        };
    }


    const closes =
        m5.map(c => c.close);


    const ema20 =
        calculateEMA(closes, 20);

    const ema50 =
        calculateEMA(closes, 50);

    const ema200 =
        calculateEMA(closes, 200);

    const rsi =
        calculateRSI(closes, 14);

    const atr =
        calculateATR(m5, 14);

    const momentum =
        evaluateMomentum(
            m5,
            direction
        );

    const candle =
        evaluateCandleQuality(
            m5[m5.length - 1]
        );

    const emaAlignment =
        evaluateEMAAlignment(
            ema20,
            ema50,
            ema200,
            direction
        );

    const rsiProtection =
        getEliteRSIProtection(
            rsi,
            direction
        );

    const extension =
        evaluateEMAExtension(
            MarketState.livePrice,
            ema20,
            atr,
            direction
        );

    const structure =
        evaluateMultiTimeframeStructure();

    const sr =
        calculateSupportResistance(
            m5
        );

    const srValidation =
        evaluateSRValidation(
            MarketState.livePrice,
            sr,
            atr,
            direction
        );

    const session =
        getTradingSession();

    const news =
        evaluateNewsBlocker();


    const reversal =
        detectAPlusReversal(
            m5,
            rsi,
            direction
        );


    const sl =
        calculateStructuralSL(
            m5,
            direction,
            MarketState.livePrice,
            atr
        );


    const levels =
        calculateTradeLevels(
            MarketState.livePrice,
            sl,
            direction
        );


    let score = 0;


    /*
       DIRECTION
    */

    if (
        directionResult.direction === direction
    ) {

        score++;
    }


    /*
       STRUCTURE
    */

    if (structure.valid) {

        score++;
    }


    /*
       EMA
    */

    if (emaAlignment.valid) {

        score++;
    }


    /*
       RSI
    */

    if (rsiProtection.valid) {

        score++;
    }


    /*
       MOMENTUM
    */

    if (momentum.valid) {

        score++;
    }


    /*
       CANDLE
    */

    if (candle.valid) {

        score++;
    }


    /*
       EMA EXTENSION
    */

    if (extension.valid) {

        score++;
    }


    /*
       SESSION CONTEXT
    */

    if (session.active) {

        score++;
    }


    /*
       S/R
    */

    if (srValidation.valid) {

        score++;
    }


    /*
       REAL R:R
    */

    if (levels.valid) {

        score++;
    }


    /*
       REVERSAL BONUS
    */

    if (reversal.valid) {

        score++;
    }


    /*
       HARD BLOCKERS
    */

    if (!rsiProtection.valid) {

        return {

            decision:
                direction === "BUY"
                    ? "BLOCKED BUY"
                    : "BLOCKED SELL",

            direction,

            score,

            reason:
                rsiProtection.status,

            valid: false,

            directionCheck:
                true,

            structureCheck:
                structure.valid,

            emaCheck:
                emaAlignment.valid,

            rsiCheck:
                rsiProtection.valid,

            rsiProtection,

            momentumCheck:
                momentum.valid,

            momentum,

            candleCheck:
                candle.valid,

            candle,

            extensionCheck:
                extension.valid,

            extension,

            sessionCheck:
                session.active,

            session,

            srCheck:
                srValidation.valid,

            srValidation,

            newsCheck:
                news.valid,

            news,

            slCheck:
                finite(sl),

            rrCheck:
                levels.valid,

            levels,

            reversal
        };
    }


    if (!extension.valid) {

        return {

            decision: "WAIT",

            direction,

            score,

            reason:
                "EMA extension protection active",

            valid: false,

            directionCheck: true,

            structureCheck:
                structure.valid,

            emaCheck:
                emaAlignment.valid,

            rsiCheck:
                rsiProtection.valid,

            rsiProtection,

            momentumCheck:
                momentum.valid,

            momentum,

            candleCheck:
                candle.valid,

            candle,

            extensionCheck:
                extension.valid,

            extension,

            sessionCheck:
                session.active,

            session,

            srCheck:
                srValidation.valid,

            srValidation,

            newsCheck:
                news.valid,

            news,

            slCheck:
                finite(sl),

            rrCheck:
                levels.valid,

            levels,

            reversal
        };
    }


    if (
        Engine3Config.NEWS_BLOCKER &&
        !news.valid
    ) {

        return {

            decision: "WAIT",

            direction,

            score,

            reason:
                "WAIT — NEWS UNKNOWN",

            valid: false,

            directionCheck: true,

            structureCheck:
                structure.valid,

            emaCheck:
                emaAlignment.valid,

            rsiCheck:
                rsiProtection.valid,

            rsiProtection,

            momentumCheck:
                momentum.valid,

            momentum,

            candleCheck:
                candle.valid,

            candle,

            extensionCheck:
                extension.valid,

            extension,

            sessionCheck:
                session.active,

            session,

            srCheck:
                srValidation.valid,

            srValidation,

            newsCheck:
                news.valid,

            news,

            slCheck:
                finite(sl),

            rrCheck:
                levels.valid,

            levels,

            reversal
        };
    }


    if (!levels.valid) {

        return {

            decision: "WAIT",

            direction,

            score,

            reason:
                "Real R:R below minimum 1:2",

            valid: false,

            directionCheck: true,

            structureCheck:
                structure.valid,

            emaCheck:
                emaAlignment.valid,

            rsiCheck:
                rsiProtection.valid,

            rsiProtection,

            momentumCheck:
                momentum.valid,

            momentum,

            candleCheck:
                candle.valid,

            candle,

            extensionCheck:
                extension.valid,

            extension,

            sessionCheck:
                session.active,

            session,

            srCheck:
                srValidation.valid,

            srValidation,

            newsCheck:
                news.valid,

            news,

            slCheck:
                finite(sl),

            rrCheck:
                levels.valid,

            levels,

            reversal
        };
    }


    const approved =
        score >=
        Engine3Config.REQUIRED_SCORE;


    return {

        decision:
            approved
                ? direction
                : "WAIT",

        direction,

        score,

        reason:
            approved
                ? "A+ conditions confirmed"
                : "A+ score not reached",

        valid: approved,

        directionCheck: true,

        structureCheck:
            structure.valid,

        emaCheck:
            emaAlignment.valid,

        rsiCheck:
            rsiProtection.valid,

        rsiProtection,

        momentumCheck:
            momentum.valid,

        momentum,

        candleCheck:
            candle.valid,

        candle,

        extensionCheck:
            extension.valid,

        extension,

        sessionCheck:
            session.active,

        session,

        srCheck:
            srValidation.valid,

        srValidation,

        newsCheck:
            news.valid,

        news,

        slCheck:
            finite(sl),

        rrCheck:
            levels.valid,

        levels,

        reversal
    };
}


/* =========================================================
   ENGINE 3 DISPLAY
   ========================================================= */

function updateEngine3Display(result) {

    if (!result) {

        return;
    }


    setText(
        "decision",
        result.decision
    );


    setText(
        "decisionReason",
        result.reason
    );


    setText(
        "score",
        `${result.score} / 10`
    );


    const scoreFill =
        document.getElementById(
            "scoreFill"
        );


    if (scoreFill) {

        const percentage =
            Math.min(
                100,
                (result.score / 10) * 100
            );

        scoreFill.style.width =
            percentage + "%";
    }


    displayCheck(
        "checkDirection",
        result.directionCheck,
        result.directionCheck
            ? "PASS"
            : "FAIL"
    );


    displayCheck(
        "checkStructure",
        result.structureCheck,
        result.structureCheck
            ? "PASS"
            : "FAIL"
    );


    displayCheck(
        "checkEma",
        result.emaCheck,
        result.emaCheck
            ? "PASS"
            : "FAIL"
    );


    displayCheck(
        "checkRsi",
        result.rsiCheck,
        result.rsiCheck
            ? "SAFE"
            : "FAIL"
    );


    displayCheck(
        "checkRsiProtection",
        result.rsiProtection?.valid,
        result.rsiProtection?.status ||
            "PENDING"
    );


    displayCheck(
        "checkMomentum",
        result.momentumCheck,
        result.momentum?.status ||
            "PENDING"
    );


    displayCheck(
        "checkCandle",
        result.candleCheck,
        result.candle?.quality ||
            "PENDING"
    );


    displayCheck(
        "checkExtension",
        result.extensionCheck,
        result.extension?.status ||
            "PENDING"
    );


    displayCheck(
        "checkSession",
        true,
        result.session?.name ||
            "CONTEXT"
    );


    displayCheck(
        "checkSr",
        result.srCheck,
        result.srValidation?.status ||
            "PENDING"
    );


    displayCheck(
        "checkNews",
        result.newsCheck,
        result.news?.status ||
            "UNKNOWN"
    );


    displayCheck(
        "checkSl",
        result.slCheck,
        result.slCheck
            ? "READY"
            : "PENDING"
    );


    displayCheck(
        "checkRr",
        result.rrCheck,
        result.levels?.rr
            ? `1:${result.levels.rr.toFixed(2)}`
            : "PENDING"
    );


    displayCheck(
        "checkReversal",
        result.reversal?.valid,
        result.reversal?.status ||
            "NO REVERSAL"
    );


    if (result.levels) {

        setText(
            "riskEntry",
            formatPrice(
                result.levels.entry
            )
        );

        setText(
            "riskSl",
            formatPrice(
                result.levels.sl
            )
        );

        setText(
            "riskTp1",
            formatPrice(
                result.levels.tp1
            )
        );

        setText(
            "riskTp2",
            formatPrice(
                result.levels.tp2
            )
        );

        setText(
            "riskRr",
            finite(result.levels.rr)
                ? `1:${result.levels.rr.toFixed(2)}`
                : "—"
        );
    }
}


/* =========================================================
   CHECKLIST DISPLAY
   ========================================================= */

function displayCheck(
    prefix,
    valid,
    status
) {

    const icon =
        document.getElementById(
            prefix + "Icon"
        );

    const statusEl =
        document.getElementById(
            prefix + "Status"
        );


    if (icon) {

        icon.textContent =
            valid
                ? "✓"
                : "×";

        icon.style.color =
            valid
                ? "#00e59a"
                : "#ff405d";

        icon.style.borderColor =
            valid
                ? "#087c5c"
                : "#8b2436";
    }


    if (statusEl) {

        statusEl.textContent =
            status || "PENDING";

        statusEl.style.color =
            valid
                ? "#00e59a"
                : "#ffc83d";
    }
}


/* =========================================================
   GENERAL CHECKLIST
   ========================================================= */

function updateChecklistDisplay(
    result
) {

    updateEngine3Display(result);
}


/* =========================================================
   TIMEFRAME DISPLAY
   ========================================================= */

function updateTimeframeDisplays() {

    const h4 =
        evaluateStructure(
            MarketState.candles.H4
        );

    const h1 =
        evaluateStructure(
            MarketState.candles.H1
        );

    const m15 =
        evaluateStructure(
            MarketState.candles.M15
        );

    const m5 =
        evaluateStructure(
            MarketState.candles.M5
        );


    const h4Direction =
        getTimeframeDirection(
            MarketState.candles.H4
        );

    const h1Direction =
        getTimeframeDirection(
            MarketState.candles.H1
        );

    const m15Direction =
        getTimeframeDirection(
            MarketState.candles.M15
        );

    const m5Direction =
        getTimeframeDirection(
            MarketState.candles.M5
        );


    setText(
        "h4Direction",
        h4Direction
    );

    setText(
        "h4Structure",
        h4.status
    );

    setText(
        "h4High",
        formatPrice(h4.swingHigh)
    );

    setText(
        "h4Low",
        formatPrice(h4.swingLow)
    );


    setText(
        "h1Direction",
        h1Direction
    );

    setText(
        "h1Structure",
        h1.status
    );

    setText(
        "h1High",
        formatPrice(h1.swingHigh)
    );

    setText(
        "h1Low",
        formatPrice(h1.swingLow)
    );


    setText(
        "m15Structure",
        m15.status
    );

    setText(
        "m15Trend",
        m15Direction
    );


    const m15Closes =
        MarketState.candles.M15
            .map(c => c.close);

    const m15Ema20 =
        calculateEMA(
            m15Closes,
            20
        );

    const m15Ema50 =
        calculateEMA(
            m15Closes,
            50
        );

    const m15Ema200 =
        calculateEMA(
            m15Closes,
            200
        );


    const m15Ema =
        evaluateEMAAlignment(
            m15Ema20,
            m15Ema50,
            m15Ema200,
            m15Direction
        );


    setText(
        "m15Ema",
        m15Ema.status
    );


    setText(
        "m15Liquidity",
        "PRICE / VOLUME DATA"
    );


    setText(
        "m5Structure",
        m5.status
    );


    const m5Closes =
        MarketState.candles.M5
            .map(c => c.close);


    const ema20 =
        calculateEMA(
            m5Closes,
            20
        );

    const ema50 =
        calculateEMA(
            m5Closes,
            50
        );

    const ema200 =
        calculateEMA(
            m5Closes,
            200
        );

    const rsi =
        calculateRSI(
            m5Closes,
            14
        );


    const m5Ema =
        evaluateEMAAlignment(
            ema20,
            ema50,
            ema200,
            m5Direction
        );


    setText(
        "m5Ema",
        m5Ema.status
    );


    setText(
        "m5Rsi",
        finite(rsi)
            ? rsi.toFixed(1)
            : "—"
    );


    const lastCandle =
        MarketState.candles.M5[
            MarketState.candles.M5.length - 1
        ];


    const quality =
        evaluateCandleQuality(
            lastCandle
        );


    setText(
        "m5CandleQuality",
        quality.quality
    );


    setText(
        "ema20",
        formatPrice(ema20)
    );

    setText(
        "ema50",
        formatPrice(ema50)
    );

    setText(
        "ema200",
        formatPrice(ema200)
    );

    setText(
        "rsi",
        finite(rsi)
            ? rsi.toFixed(1)
            : "—"
    );


    const momentum =
        calculateMomentum(
            m5Closes,
            Engine3Config.MOMENTUM_LOOKBACK
        );


    setText(
        "momentum",
        finite(momentum)
            ? momentum.toFixed(5)
            : "—"
    );


    const atr =
        calculateATR(
            MarketState.candles.M5,
            14
        );


    const extension =
        evaluateEMAExtension(
            MarketState.livePrice,
            ema20,
            atr,
            m5Direction
        );


    setText(
        "emaExtension",
        extension.status
    );
}


/* =========================================================
   SUPPORT / RESISTANCE DISPLAY
   ========================================================= */

function updateSRDisplay() {

    const sr =
        calculateSupportResistance(
            MarketState.candles.M5
        );


    setText(
        "resistance1",
        formatPrice(sr.resistance1)
    );

    setText(
        "resistance2",
        formatPrice(sr.resistance2)
    );

    setText(
        "support1",
        formatPrice(sr.support1)
    );

    setText(
        "support2",
        formatPrice(sr.support2)
    );

    updatePriceDisplay();
}


/* =========================================================
   CLOCK
   ========================================================= */

function updateIndiaClock() {

    const now =
        new Date();


    const formatted =
        new Intl.DateTimeFormat(
            "en-IN",
            {

                timeZone:
                    "Asia/Kolkata",

                hour:
                    "2-digit",

                minute:
                    "2-digit",

                second:
                    "2-digit",

                hour12:
                    false
            }
        ).format(now);


    setText(
        "clock",
        formatted
    );
}


/* =========================================================
   CHART TIME CONVERSION
   ========================================================= */

function convertCandleTime(datetime) {

    if (!datetime) {

        return null;
    }


    let text =
        String(datetime).trim();


    /*
       Twelve Data normally supplies:

       YYYY-MM-DD HH:MM:SS
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


    if (!Number.isFinite(timestamp)) {

        return null;
    }


    return timestamp;
}


/* =========================================================
   CHART INITIALIZATION
   ========================================================= */

function initializeChart() {

    const container =
        document.getElementById(
            "chartArea"
        );


    if (!container) {

        console.warn(
            "Chart container not found."
        );

        return;
    }


    if (
        typeof LightweightCharts ===
        "undefined"
    ) {

        console.error(
            "Lightweight Charts library not loaded."
        );

        setText(
            "chartMessageText",
            "Chart library failed to load"
        );

        return;
    }


    if (ChartState.initialized) {

        return;
    }


    /*
       Remove the old waiting message
       from the visual chart layer.
    */

    const message =
        document.getElementById(
            "chartMessage"
        );


    if (message) {

        message.style.zIndex = "0";
    }


    ChartState.chart =
        LightweightCharts.createChart(
            container,
            {

                autoSize: true,

                layout: {

                    background: {

                        type: "solid",

                        color: "#06111b"
                    },

                    textColor: "#91afc2"
                },


                grid: {

                    vertLines: {

                        color:
                            "rgba(34,83,110,0.18)"
                    },

                    horzLines: {

                        color:
                            "rgba(34,83,110,0.18)"
                    }
                },


                crosshair: {

                    mode:
                        LightweightCharts.CrosshairMode
                            ? LightweightCharts.CrosshairMode.Normal
                            : 0
                },


                rightPriceScale: {

                    borderColor:
                        "#123b56"
                },


                timeScale: {

                    borderColor:
                        "#123b56",

                    timeVisible:
                        true,

                    secondsVisible:
                        false,

                    rightOffset:
                        5
                }
            }
        );


    /*
       CURRENT LIGHTWEIGHT CHARTS v5 API
    */

    ChartState.candleSeries =
        ChartState.chart.addSeries(
            LightweightCharts.CandlestickSeries,
            {

                upColor: "#00e59a",

                downColor: "#ff405d",

                borderVisible: false,

                wickUpColor: "#00e59a",

                wickDownColor: "#ff405d"
            }
        );


    ChartState.ema20Series =
        ChartState.chart.addSeries(
            LightweightCharts.LineSeries,
            {

                color: "#20d9ff",

                lineWidth: 2,

                title: "EMA 20",

                lastValueVisible: false,

                priceLineVisible: false
            }
        );


    ChartState.ema50Series =
        ChartState.chart.addSeries(
            LightweightCharts.LineSeries,
            {

                color: "#ffc83d",

                lineWidth: 2,

                title: "EMA 50",

                lastValueVisible: false,

                priceLineVisible: false
            }
        );


    ChartState.ema200Series =
        ChartState.chart.addSeries(
            LightweightCharts.LineSeries,
            {

                color: "#ff9f1c",

                lineWidth: 2,

                title: "EMA 200",

                lastValueVisible: false,

                priceLineVisible: false
            }
        );


    ChartState.initialized = true;


    setText(
        "chartState",
        "CHART: READY"
    );
}


/* =========================================================
   UPDATE LIVE PRICE LINE
   ========================================================= */

function updateLivePriceLine() {

    if (
        !ChartState.candleSeries ||
        !finite(MarketState.livePrice)
    ) {

        return;
    }


    /*
       Remove previous live price line.
    */

    if (ChartState.livePriceLine) {

        try {

            ChartState.candleSeries.removePriceLine(
                ChartState.livePriceLine
            );

        } catch (error) {

            console.warn(
                "Could not remove old price line."
            );
        }
    }


    ChartState.livePriceLine =
        ChartState.candleSeries.createPriceLine(
            {

                price:
                    MarketState.livePrice,

                color:
                    "#20d9ff",

                lineWidth:
                    1,

                lineStyle:
                    2,

                axisLabelVisible:
                    true,

                title:
                    "LIVE"
            }
        );
}


/* =========================================================
   UPDATE FINANCIAL CHART
   ========================================================= */

function updateFinancialChart() {

    initializeChart();


    if (
        !ChartState.initialized ||
        !ChartState.candleSeries
    ) {

        return;
    }


    const candles =
        MarketState.candles.M5;


    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {

        setText(
            "chartMessageText",
            "Waiting for real EUR/USD candle data"
        );

        setText(
            "chartState",
            "DATA: WAITING"
        );

        return;
    }


    const chartCandles = [];


    for (const candle of candles) {

        const time =
            candle.chartTime ||
            convertCandleTime(
                candle.datetime
            );


        if (!time) {

            continue;
        }


        if (
            !finite(candle.open) ||
            !finite(candle.high) ||
            !finite(candle.low) ||
            !finite(candle.close)
        ) {

            continue;
        }


        chartCandles.push({

            time,

            open:
                Number(candle.open),

            high:
                Number(candle.high),

            low:
                Number(candle.low),

            close:
                Number(candle.close)
        });
    }


    /*
       Lightweight Charts requires
       ascending unique timestamps.
    */

    chartCandles.sort(
        (a, b) =>
            a.time - b.time
    );


    const uniqueCandles = [];


    for (const candle of chartCandles) {

        const previous =
            uniqueCandles[
                uniqueCandles.length - 1
            ];


        if (
            previous &&
            previous.time === candle.time
        ) {

            uniqueCandles[
                uniqueCandles.length - 1
            ] = candle;

        } else {

            uniqueCandles.push(candle);
        }
    }


    if (!uniqueCandles.length) {

        setText(
            "chartMessageText",
            "No valid candle data received"
        );

        setText(
            "chartState",
            "DATA: INVALID"
        );

        return;
    }


    ChartState.candleSeries.setData(
        uniqueCandles
    );


    /*
       EMA DATA
    */

    const candlesWithChartTime =
        candles
            .map(c => ({

                ...c,

                chartTime:
                    c.chartTime ||
                    convertCandleTime(
                        c.datetime
                    )
            }))
            .filter(
                c =>
                    c.chartTime &&
                    finite(c.close)
            )
            .sort(
                (a, b) =>
                    a.chartTime -
                    b.chartTime
            );


    const ema20Data =
        calculateEMASeries(
            candlesWithChartTime,
            20
        );


    const ema50Data =
        calculateEMASeries(
            candlesWithChartTime,
            50
        );


    const ema200Data =
        calculateEMASeries(
            candlesWithChartTime,
            200
        );


    ChartState.ema20Series.setData(
        ema20Data
    );


    ChartState.ema50Series.setData(
        ema50Data
    );


    ChartState.ema200Series.setData(
        ema200Data
    );


    /*
       Live price
    */

    updateLivePriceLine();


    /*
       Fit chart only after initial population.
    */

    ChartState.chart
        .timeScale()
        .fitContent();


    /*
       Hide waiting message.
    */

    const message =
        document.getElementById(
            "chartMessage"
        );


    if (message) {

        message.style.display =
            "none";
    }


    setText(
        "chartState",
        "M5 • LIVE DATA"
    );
}


/* =========================================================
   TWELVE DATA FETCH
   ========================================================= */

async function twelveDataFetch(
    endpoint,
    params = {}
) {

    const url =
        new URL(
            TWELVE_DATA_BASE +
            endpoint
        );


    url.searchParams.set(
        "apikey",
        TWELVE_DATA_API_KEY
    );


    for (
        const [key, value]
        of Object.entries(params)
    ) {

        url.searchParams.set(
            key,
            value
        );
    }


    const response =
        await fetch(
            url.toString()
        );


    if (!response.ok) {

        throw new Error(
            `HTTP ${response.status}`
        );
    }


    const data =
        await response.json();


    if (data.status === "error") {

        throw new Error(
            data.message ||
            "Twelve Data API error"
        );
    }


    return data;
}


/* =========================================================
   LIVE PRICE
   ========================================================= */

async function fetchLivePrice() {

    const data =
        await twelveDataFetch(
            "/price",
            {

                symbol:
                    PAIR
            }
        );


    const price =
        Number(data.price);


    if (!finite(price)) {

        throw new Error(
            "Invalid live price"
        );
    }


    MarketState.livePrice =
        price;

    MarketState.livePriceTime =
        new Date();


    updatePriceDisplay();


    return price;
}


/* =========================================================
   CANDLE FETCH
   ========================================================= */

async function fetchCandles(
    interval
) {

    const data =
        await twelveDataFetch(
            "/time_series",
            {

                symbol:
                    PAIR,

                interval,

                outputsize:
                    250,

                format:
                    "JSON"
            }
        );


    if (
        !data.values ||
        !Array.isArray(data.values)
    ) {

        throw new Error(
            `No candle data for ${interval}`
        );
    }


    /*
       Twelve Data commonly returns
       newest candle first.

       We reverse it so our internal
       data is oldest -> newest.
    */

    const candles =
        data.values
            .map(item => {

                const chartTime =
                    convertCandleTime(
                        item.datetime
                    );


                return {

                    datetime:
                        item.datetime,

                    chartTime,

                    open:
                        Number(item.open),

                    high:
                        Number(item.high),

                    low:
                        Number(item.low),

                    close:
                        Number(item.close),

                    volume:
                        finite(item.volume)
                            ? Number(item.volume)
                            : null
                };

            })
            .filter(c =>
                c.chartTime &&
                finite(c.open) &&
                finite(c.high) &&
                finite(c.low) &&
                finite(c.close)
            )
            .reverse();


    return candles;
}


/* =========================================================
   LOAD MARKET DATA
   ========================================================= */

async function loadMarketData() {

    try {

        setText(
            "chartState",
            "DATA: LOADING..."
        );


        const [
            livePrice,
            h4,
            h1,
            m15,
            m5
        ] =
            await Promise.all([

                fetchLivePrice(),

                fetchCandles("4h"),

                fetchCandles("1h"),

                fetchCandles("15min"),

                fetchCandles("5min")
            ]);


        MarketState.livePrice =
            livePrice;

        MarketState.candles.H4 =
            h4;

        MarketState.candles.H1 =
            h1;

        MarketState.candles.M15 =
            m15;

        MarketState.candles.M5 =
            m5;


        MarketState.connected =
            true;

        MarketState.lastUpdate =
            new Date();


        updatePriceDisplay();

        updateM5Status();

        updateDataStatus();

        updateSessionDisplay();

        updateTimeframeDisplays();

        updateSRDisplay();

        updateFinancialChart();


        runAllEngines();


        setText(
            "chartMessageText",
            "Real EUR/USD M5 data connected"
        );


    } catch (error) {

        console.error(
            "Market data error:",
            error
        );


        MarketState.connected =
            false;


        setText(
            "chartState",
            "DATA: ERROR"
        );


        setText(
            "chartMessageText",
            "Live market data unavailable"
        );


        setText(
            "candleStatus",
            "ERROR"
        );


        /*
           Never generate fake data.
        */

        setText(
            "decision",
            "WAIT"
        );


        setText(
            "decisionReason",
            "Live market data unavailable"
        );
    }
}


/* =========================================================
   RUN ALL ENGINES
   ========================================================= */

function runAllEngines() {

    MarketState.engine1 =
        runEngine1();


    MarketState.engine2 =
        runEngine2();


    MarketState.engine3 =
        evaluateTradeGate();


    updateEngine3Display(
        MarketState.engine3
    );
}


/* =========================================================
   BUY ANALYSIS
   ========================================================= */

function analyzeBuy() {

    if (!MarketState.engine3) {

        refreshDashboard();

        return;
    }


    const result =
        MarketState.engine3;


    if (
        result.direction === "BUY"
    ) {

        setText(
            "decisionReason",
            result.reason
        );

    } else {

        setText(
            "decisionReason",
            "BUY analysis: conditions not confirmed"
        );
    }
}


/* =========================================================
   SELL ANALYSIS
   ========================================================= */

function analyzeSell() {

    if (!MarketState.engine3) {

        refreshDashboard();

        return;
    }


    const result =
        MarketState.engine3;


    if (
        result.direction === "SELL"
    ) {

        setText(
            "decisionReason",
            result.reason
        );

    } else {

        setText(
            "decisionReason",
            "SELL analysis: conditions not confirmed"
        );
    }
}


/* =========================================================
   ALERT
   ========================================================= */

function setAlert() {

    alert(
        "Alert system will be connected in a later module."
    );
}


/* =========================================================
   REFRESH DASHBOARD
   ========================================================= */

async function refreshDashboard() {

    await loadMarketData();
}


/* =========================================================
   INITIALIZATION
   ========================================================= */

function initializeDashboard() {

    updateIndiaClock();

    setInterval(
        updateIndiaClock,
        1000
    );


    /*
       Initialize chart after
       Lightweight Charts has loaded.
    */

    initializeChart();


    /*
       Load real market data.
    */

    loadMarketData();


    /*
       Refresh every 30 seconds.
    */

    setInterval(
        loadMarketData,
        AUTO_REFRESH_MS
    );
}


/* =========================================================
   GLOBAL EXPORTS
   ========================================================= */

window.MarketState =
    MarketState;

window.runEngine3 =
    runAllEngines;

window.evaluateTradeGate =
    evaluateTradeGate;

window.getEliteRSIProtection =
    getEliteRSIProtection;

window.calculateTradeLevels =
    calculateTradeLevels;

window.calculateSupportResistance =
    calculateSupportResistance;

window.getTradingSession =
    getTradingSession;

window.refreshDashboard =
    refreshDashboard;

window.analyzeBuy =
    analyzeBuy;

window.analyzeSell =
    analyzeSell;

window.setAlert =
    setAlert;


/* =========================================================
   START
   ========================================================= */

if (
    document.readyState ===
    "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initializeDashboard
    );

} else {

    initializeDashboard();
}
