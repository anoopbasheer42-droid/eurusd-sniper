/* =========================================================
   EUR/USD SNIPER DASHBOARD
   ENGINE 3 — ELITE TRADE GATE
   CORRECTED VERSION
   ========================================================= */

"use strict";
/* =========================================================
   TWELVE DATA API
   ========================================================= */

const TWELVE_DATA_API_KEY = "53821bf38bec40e4a88bd1fa06ac32b3";

/* =========================================================
   GLOBAL MARKET STATE
   ========================================================= */

const MarketState = {

    pair: "EUR/USD",

    /* -----------------------------------------------------
       LIVE PRICE
       This is kept separate from completed M5 candles.
       ----------------------------------------------------- */

    livePrice: null,

    livePriceTime: null,

    /* -----------------------------------------------------
       CANDLES
       ----------------------------------------------------- */

    candles: {

        H4: [],
        H1: [],
        M15: [],
        M5: []

    },

    /* -----------------------------------------------------
       INDICATORS
       ----------------------------------------------------- */

    indicators: {

        EMA20: null,
        EMA50: null,
        EMA200: null,

        RSI14: null,

        momentum: null,

        ATR14: null

    },

    /* -----------------------------------------------------
       ENGINE STATES
       ----------------------------------------------------- */

    engine1: null,

    engine2: null,

    engine3: null,

    connected: false,

    lastUpdate: null,

    /* -----------------------------------------------------
       NEWS
       ----------------------------------------------------- */

    news: {

        status: "UNKNOWN",

        highImpact: false,

        blocked: false,

        events: []

    },

    /* -----------------------------------------------------
       SESSION
       ----------------------------------------------------- */

    session: {

        name: "UNKNOWN",

        active: false,

        context: ""

    }

};


/* =========================================================
   ENGINE 3 CONFIGURATION
   ========================================================= */

const Engine3Config = {

    /* -----------------------------------------------------
       RSI
       ----------------------------------------------------- */

    RSI_OVERSOLD: 30,

    RSI_OVERBOUGHT: 70,

    RSI_BUY_MIN: 35,

    RSI_BUY_MAX: 68,

    RSI_SELL_MIN: 32,

    RSI_SELL_MAX: 65,


    /* -----------------------------------------------------
       EMA EXTENSION
       ----------------------------------------------------- */

    EMA_EXTENSION_ATR: 1.5,


    /* -----------------------------------------------------
       RISK / REWARD
       ----------------------------------------------------- */

    MIN_RR: 2.0,


    /* -----------------------------------------------------
       STRUCTURE
       ----------------------------------------------------- */

    STRUCTURE_LOOKBACK: 20,

    SWING_LOOKBACK: 3,


    /* -----------------------------------------------------
       S/R
       ----------------------------------------------------- */

    SR_LOOKBACK: 30,

    SR_ZONE_ATR: 0.50,


    /* -----------------------------------------------------
       MOMENTUM
       ----------------------------------------------------- */

    MOMENTUM_LOOKBACK: 5,


    /* -----------------------------------------------------
       SCORE
       ----------------------------------------------------- */

    REQUIRED_SCORE: 8,


    /* -----------------------------------------------------
       NEWS
       ----------------------------------------------------- */

    NEWS_BLOCKER: true

};


/* =========================================================
   DOM HELPER
   ========================================================= */

function setText(id, value) {

    const element = document.getElementById(id);

    if (!element) return;

    element.textContent = value;

}


/* =========================================================
   NUMBER SAFETY
   ========================================================= */

function finite(value) {

    return Number.isFinite(Number(value));

}


/* =========================================================
   PRICE DISPLAY
   ========================================================= */

function updatePriceDisplay() {

    if (
        !finite(MarketState.livePrice)
    ) {

        setText("livePrice", "—");
        setText("chartPrice", "—");
        setText("srPrice", "—");

        return;

    }


    const price =
        Number(MarketState.livePrice).toFixed(5);


    setText(
        "livePrice",
        price
    );


    setText(
        "chartPrice",
        price
    );


    setText(
        "srPrice",
        price
    );

}


/* =========================================================
   DATA STATUS
   ========================================================= */

function updateDataStatus(message) {

    setText(
        "chartState",
        message
    );

}


/* =========================================================
   M5 STATUS
   ========================================================= */

function updateM5Status() {

    const candles =
        MarketState.candles.M5;


    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {

        setText(
            "candleStatus",
            "WAITING"
        );

        return;

    }


    setText(
        "candleStatus",
        "READY"
    );

}


/* =========================================================
   EMA
   ========================================================= */

function calculateEMA(values, period) {

    if (!Array.isArray(values)) {
        return null;
    }


    if (values.length < period) {
        return null;
    }


    const multiplier =
        2 / (period + 1);


    let ema =
        values
            .slice(0, period)
            .reduce(
                (sum, value) =>
                    sum + Number(value),
                0
            ) / period;


    for (
        let i = period;
        i < values.length;
        i++
    ) {

        ema =
            (
                (Number(values[i]) - ema) *
                multiplier
            ) + ema;

    }


    return ema;

}


/* =========================================================
   RSI
   ========================================================= */

function calculateRSI(
    values,
    period = 14
) {

    if (!Array.isArray(values)) {
        return null;
    }


    if (values.length <= period) {
        return null;
    }


    let gains = 0;
    let losses = 0;


    for (
        let i = 1;
        i <= period;
        i++
    ) {

        const difference =
            Number(values[i]) -
            Number(values[i - 1]);


        if (difference >= 0) {

            gains += difference;

        } else {

            losses += Math.abs(
                difference
            );

        }

    }


    let averageGain =
        gains / period;


    let averageLoss =
        losses / period;


    for (
        let i = period + 1;
        i < values.length;
        i++
    ) {

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
            (
                (
                    averageGain *
                    (period - 1)
                ) + gain
            ) / period;


        averageLoss =
            (
                (
                    averageLoss *
                    (period - 1)
                ) + loss
            ) / period;

    }


    if (averageLoss === 0) {
        return 100;
    }


    const rs =
        averageGain /
        averageLoss;


    return 100 -
        (
            100 /
            (1 + rs)
        );

}


/* =========================================================
   ATR
   ========================================================= */

function calculateATR(
    candles,
    period = 14
) {

    if (
        !Array.isArray(candles) ||
        candles.length <= period
    ) {

        return null;

    }


    const trueRanges = [];


    for (
        let i = 1;
        i < candles.length;
        i++
    ) {

        const high =
            Number(candles[i].high);

        const low =
            Number(candles[i].low);

        const previousClose =
            Number(candles[i - 1].close);


        if (
            !finite(high) ||
            !finite(low) ||
            !finite(previousClose)
        ) {

            continue;

        }


        const range1 =
            high - low;


        const range2 =
            Math.abs(
                high - previousClose
            );


        const range3 =
            Math.abs(
                low - previousClose
            );


        trueRanges.push(
            Math.max(
                range1,
                range2,
                range3
            )
        );

    }


    if (
        trueRanges.length < period
    ) {

        return null;

    }


    let atr =
        trueRanges
            .slice(0, period)
            .reduce(
                (sum, value) =>
                    sum + value,
                0
            ) / period;


    for (
        let i = period;
        i < trueRanges.length;
        i++
    ) {

        atr =
            (
                (
                    atr *
                    (period - 1)
                ) +
                trueRanges[i]
            ) / period;

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

    if (
        !Array.isArray(values) ||
        values.length <= lookback
    ) {

        return null;

    }


    const current =
        Number(
            values[values.length - 1]
        );


    const previous =
        Number(
            values[
                values.length -
                1 -
                lookback
            ]
        );


    if (
        !finite(current) ||
        !finite(previous)
    ) {

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


    const open =
        Number(candle.open);

    const close =
        Number(candle.close);


    if (
        !finite(open) ||
        !finite(close)
    ) {

        return "UNKNOWN";

    }


    if (close > open) {
        return "BUY";
    }


    if (close < open) {
        return "SELL";
    }


    return "NEUTRAL";

}


/* =========================================================
   CANDLE QUALITY
   ========================================================= */

function evaluateCandleQuality(
    candles
) {

    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {

        return {

            valid: false,

            score: 0,

            reason: "Candle data unavailable"

        };

    }


    const candle =
        candles[candles.length - 1];


    const open =
        Number(candle.open);

    const high =
        Number(candle.high);

    const low =
        Number(candle.low);

    const close =
        Number(candle.close);


    if (
        !finite(open) ||
        !finite(high) ||
        !finite(low) ||
        !finite(close)
    ) {

        return {

            valid: false,

            score: 0,

            reason: "Invalid candle"

        };

    }


    const range =
        high - low;


    const body =
        Math.abs(
            close - open
        );


    if (range <= 0) {

        return {

            valid: false,

            score: 0,

            reason: "Zero candle range"

        };

    }


    const bodyRatio =
        body / range;


    if (bodyRatio < 0.40) {

        return {

            valid: false,

            score: 0,

            reason: "Weak candle body"

        };

    }


    return {

        valid: true,

        score:
            bodyRatio >= 0.60
                ? 2
                : 1,

        bodyRatio,

        direction:
            getCandleDirection(candle),

        reason:
            "Candle quality confirmed"

    };

}


/* =========================================================
   EMA ALIGNMENT
   ========================================================= */

function evaluateEMAAlignment(
    price,
    ema20,
    ema50,
    ema200,
    direction
) {

    if (
        !finite(price) ||
        !finite(ema20) ||
        !finite(ema50) ||
        !finite(ema200)
    ) {

        return {

            valid: false,

            reason: "EMA data unavailable"

        };

    }


    if (direction === "BUY") {

        const valid =
            price > ema20 &&
            ema20 > ema50 &&
            ema50 > ema200;


        return {

            valid,

            reason:
                valid
                    ? "Bullish EMA alignment"
                    : "Bullish EMA alignment failed"

        };

    }


    if (direction === "SELL") {

        const valid =
            price < ema20 &&
            ema20 < ema50 &&
            ema50 < ema200;


        return {

            valid,

            reason:
                valid
                    ? "Bearish EMA alignment"
                    : "Bearish EMA alignment failed"

        };

    }


    return {

        valid: false,

        reason: "Direction unavailable"

    };

}


/* =========================================================
   TIMEFRAME DIRECTION
   ========================================================= */

function getTimeframeDirection(
    candles
) {

    if (
        !Array.isArray(candles) ||
        candles.length < 20
    ) {

        return "UNKNOWN";

    }


    const closes =
        candles
            .map(
                candle =>
                    Number(candle.close)
            )
            .filter(finite);


    if (closes.length < 20) {

        return "UNKNOWN";

    }


    const ema20 =
        calculateEMA(
            closes,
            20
        );


    const close =
        closes[
            closes.length - 1
        ];


    if (
        !finite(ema20) ||
        !finite(close)
    ) {

        return "UNKNOWN";

    }


    if (close > ema20) {
        return "BUY";
    }


    if (close < ema20) {
        return "SELL";
    }


    return "NEUTRAL";

}


/* =========================================================
   H4 + H1 AGREEMENT
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


    const valid =
        h4 !== "UNKNOWN" &&
        h1 !== "UNKNOWN" &&
        h4 === h1 &&
        h4 !== "NEUTRAL";


    return {

        valid,

        direction:
            valid
                ? h4
                : "WAIT",

        H4: h4,

        H1: h1,

        reason:
            valid
                ? `H4 + H1 agree ${h4}`
                : "H4 + H1 do not agree"

    };

}


/* =========================================================
   SWING HIGH
   ========================================================= */

function isSwingHigh(
    candles,
    index,
    strength = 2
) {

    if (
        index < strength ||
        index >= candles.length - strength
    ) {

        return false;

    }


    const high =
        Number(
            candles[index].high
        );


    if (!finite(high)) {
        return false;
    }


    for (
        let i = 1;
        i <= strength;
        i++
    ) {

        if (
            high <=
            Number(
                candles[index - i].high
            )
        ) {

            return false;

        }


        if (
            high <=
            Number(
                candles[index + i].high
            )
        ) {

            return false;

        }

    }


    return true;

}


/* =========================================================
   SWING LOW
   ========================================================= */

function isSwingLow(
    candles,
    index,
    strength = 2
) {

    if (
        index < strength ||
        index >= candles.length - strength
    ) {

        return false;

    }


    const low =
        Number(
            candles[index].low
        );


    if (!finite(low)) {
        return false;
    }


    for (
        let i = 1;
        i <= strength;
        i++
    ) {

        if (
            low >=
            Number(
                candles[index - i].low
            )
        ) {

            return false;

        }


        if (
            low >=
            Number(
                candles[index + i].low
            )
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
    strength = 2
) {

    const highs = [];
    const lows = [];


    if (!Array.isArray(candles)) {

        return {

            highs,
            lows

        };

    }


    for (
        let i = strength;
        i < candles.length - strength;
        i++
    ) {

        if (
            isSwingHigh(
                candles,
                i,
                strength
            )
        ) {

            highs.push({

                index: i,

                price:
                    Number(
                        candles[i].high
                    )

            });

        }


        if (
            isSwingLow(
                candles,
                i,
                strength
            )
        ) {

            lows.push({

                index: i,

                price:
                    Number(
                        candles[i].low
                    )

            });

        }

    }


    return {

        highs,

        lows

    };

}


/* =========================================================
   SWING-BASED MARKET STRUCTURE
   ========================================================= */

function evaluateStructure(
    candles,
    direction
) {

    if (
        !Array.isArray(candles) ||
        candles.length < 10
    ) {

        return {

            valid: false,

            structure: "UNKNOWN",

            reason: "Not enough candles"

        };

    }


    const swings =
        findSwings(
            candles,
            Engine3Config.SWING_LOOKBACK
        );


    if (
        swings.highs.length < 2 ||
        swings.lows.length < 2
    ) {

        return {

            valid: false,

            structure: "UNKNOWN",

            reason: "Not enough swing points"

        };

    }


    const highs =
        swings.highs
            .slice(-2);


    const lows =
        swings.lows
            .slice(-2);


    const higherHigh =
        highs[1].price >
        highs[0].price;


    const higherLow =
        lows[1].price >
        lows[0].price;


    const lowerHigh =
        highs[1].price <
        highs[0].price;


    const lowerLow =
        lows[1].price <
        lows[0].price;


    let structure =
        "RANGE";


    if (
        higherHigh &&
        higherLow
    ) {

        structure =
            "BULLISH";

    }


    if (
        lowerHigh &&
        lowerLow
    ) {

        structure =
            "BEARISH";

    }


    const valid =
        direction === "BUY"
            ? structure === "BULLISH"
            : direction === "SELL"
                ? structure === "BEARISH"
                : false;


    return {

        valid,

        structure,

        higherHigh,

        higherLow,

        lowerHigh,

        lowerLow,

        lastHigh:
            highs[1].price,

        previousHigh:
            highs[0].price,

        lastLow:
            lows[1].price,

        previousLow:
            lows[0].price,

        reason:
            valid
                ? `${structure} structure confirmed`
                : `Structure is ${structure}`

    };

}


/* =========================================================
   M15 + M5 STRUCTURE
   ========================================================= */

function evaluateMultiTimeframeStructure(
    direction
) {

    const m15 =
        evaluateStructure(
            MarketState.candles.M15,
            direction
        );


    const m5 =
        evaluateStructure(
            MarketState.candles.M5,
            direction
        );


    return {

        valid:
            m15.valid &&
            m5.valid,

        M15: m15,

        M5: m5,

        reason:
            m15.valid && m5.valid
                ? "M15 + M5 structure agree"
                : "M15 + M5 structure not confirmed"

    };

}


/* =========================================================
   MOMENTUM
   ========================================================= */

function evaluateMomentum(
    candles,
    direction
) {

    if (
        !Array.isArray(candles)
    ) {

        return {

            valid: false,

            score: 0,

            reason: "Momentum data unavailable"

        };

    }


    const closes =
        candles
            .map(
                candle =>
                    Number(candle.close)
            )
            .filter(finite);


    const momentum =
        calculateMomentum(
            closes,
            Engine3Config.MOMENTUM_LOOKBACK
        );


    if (!finite(momentum)) {

        return {

            valid: false,

            score: 0,

            momentum: null,

            reason: "Momentum unavailable"

        };

    }


    const valid =
        direction === "BUY"
            ? momentum > 0
            : direction === "SELL"
                ? momentum < 0
                : false;


    return {

        valid,

        score:
            valid ? 1 : 0,

        momentum,

        reason:
            valid
                ? "Momentum confirms direction"
                : "Momentum disagrees"

    };

}


/* =========================================================
   RSI PROTECTION
   ========================================================= */

function getEliteRSIProtection(
    rsi,
    direction
) {

    if (
        !finite(rsi)
    ) {

        return {

            valid: false,

            hardBlock: true,

            reversalCandidate: false,

            status: "RSI DATA UNAVAILABLE",

            reason: "RSI data unavailable"

        };

    }


    /* -----------------------------------------------------
       HARD BUY PROTECTION
       ----------------------------------------------------- */

    if (
        direction === "BUY" &&
        rsi >=
        Engine3Config.RSI_OVERBOUGHT
    ) {

        return {

            valid: false,

            hardBlock: true,

            reversalCandidate: false,

            status: "BUY BLOCKED",

            reason:
                "RSI overbought — BUY blocked"

        };

    }


    /* -----------------------------------------------------
       HARD SELL PROTECTION
       ----------------------------------------------------- */

    if (
        direction === "SELL" &&
        rsi <=
        Engine3Config.RSI_OVERSOLD
    ) {

        return {

            valid: false,

            hardBlock: true,

            reversalCandidate: false,

            status: "SELL BLOCKED",

            reason:
                "RSI oversold — SELL blocked"

        };

    }


    /* -----------------------------------------------------
       BUY OVERSOLD = REVERSAL CANDIDATE
       ----------------------------------------------------- */

    if (
        direction === "BUY" &&
        rsi <=
        Engine3Config.RSI_OVERSOLD
    ) {

        return {

            valid: true,

            hardBlock: false,

            reversalCandidate: true,

            status: "BUY REVERSAL CANDIDATE",

            reason:
                "RSI oversold — reversal confirmation required"

        };

    }


    /* -----------------------------------------------------
       SELL OVERBOUGHT = REVERSAL CANDIDATE
       ----------------------------------------------------- */

    if (
        direction === "SELL" &&
        rsi >=
        Engine3Config.RSI_OVERBOUGHT
    ) {

        return {

            valid: true,

            hardBlock: false,

            reversalCandidate: true,

            status: "SELL REVERSAL CANDIDATE",

            reason:
                "RSI overbought — reversal confirmation required"

        };

    }


    return {

        valid: true,

        hardBlock: false,

        reversalCandidate: false,

        status: "RSI SAFE",

        reason: "RSI within safe trading range"

    };

}


/* =========================================================
   A+ REVERSAL DETECTION
   ========================================================= */

function detectAPlusReversal(
    candles,
    direction
) {

    if (
        !Array.isArray(candles) ||
        candles.length < 3
    ) {

        return {

            valid: false,

            reason: "Not enough candles"

        };

    }


    const previous =
        candles[
            candles.length - 2
        ];


    const current =
        candles[
            candles.length - 1
        ];


    const previousDirection =
        getCandleDirection(
            previous
        );


    const currentDirection =
        getCandleDirection(
            current
        );


    const currentQuality =
        evaluateCandleQuality(
            candles
        );


    if (direction === "BUY") {

        const valid =
            previousDirection === "SELL" &&
            currentDirection === "BUY" &&
            currentQuality.valid;


        return {

            valid,

            reason:
                valid
                    ? "A+ bullish reversal confirmed"
                    : "Bullish reversal not confirmed"

        };

    }


    if (direction === "SELL") {

        const valid =
            previousDirection === "BUY" &&
            currentDirection === "SELL" &&
            currentQuality.valid;


        return {

            valid,

            reason:
                valid
                    ? "A+ bearish reversal confirmed"
                    : "Bearish reversal not confirmed"

        };

    }


    return {

        valid: false,

        reason: "Direction unavailable"

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
        !finite(ema20)
    ) {

        return {

            valid: false,

            hardBlock: true,

            distance: null,

            limit: null,

            reason:
                "EMA extension data unavailable"

        };

    }


    let volatilityUnit =
        finite(atr) && atr > 0
            ? atr
            : price * 0.001;


    const distance =
        Math.abs(
            price - ema20
        );


    const limit =
        volatilityUnit *
        Engine3Config.EMA_EXTENSION_ATR;


    const extended =
        distance > limit;


    return {

        valid: !extended,

        hardBlock: extended,

        distance,

        limit,

        direction,

        reason:
            extended
                ? "Price too far from EMA20"
                : "EMA extension acceptable"

    };

}


/* =========================================================
   SUPPORT / RESISTANCE ZONES
   ========================================================= */

function calculateSupportResistance(
    candles
) {

    if (
        !Array.isArray(candles) ||
        candles.length < 10
    ) {

        return {

            support: null,

            resistance: null,

            supportZone: null,

            resistanceZone: null

        };

    }


    const recent =
        candles.slice(
            -Engine3Config.SR_LOOKBACK
        );


    const lows =
        recent
            .map(
                candle =>
                    Number(candle.low)
            )
            .filter(finite);


    const highs =
        recent
            .map(
                candle =>
                    Number(candle.high)
            )
            .filter(finite);


    if (
        lows.length === 0 ||
        highs.length === 0
    ) {

        return {

            support: null,

            resistance: null,

            supportZone: null,

            resistanceZone: null

        };

    }


    const support =
        Math.min(...lows);


    const resistance =
        Math.max(...highs);


    const atr =
        calculateATR(
            candles,
            14
        );


    const zoneSize =
        finite(atr)
            ? atr *
              Engine3Config.SR_ZONE_ATR
            : (
                resistance -
                support
            ) * 0.05;


    return {

        support,

        resistance,

        supportZone: {

            low:
                support - zoneSize,

            high:
                support + zoneSize

        },

        resistanceZone: {

            low:
                resistance - zoneSize,

            high:
                resistance + zoneSize

        }

    };

}


/* =========================================================
   S/R VALIDATION
   ========================================================= */

function evaluateSRValidation(
    price,
    direction,
    sr
) {

    if (
        !finite(price) ||
        !sr ||
        !finite(sr.support) ||
        !finite(sr.resistance)
    ) {

        return {

            valid: false,

            reason: "S/R unavailable",

            room: null

        };

    }


    if (direction === "BUY") {

        const room =
            sr.resistance - price;


        const valid =
            room > 0;


        return {

            valid,

            room,

            nearestLevel:
                sr.resistance,

            reason:
                valid
                    ? "Room available to resistance"
                    : "BUY too close to resistance"

        };

    }


    if (direction === "SELL") {

        const room =
            price - sr.support;


        const valid =
            room > 0;


        return {

            valid,

            room,

            nearestLevel:
                sr.support,

            reason:
                valid
                    ? "Room available to support"
                    : "SELL too close to support"

        };

    }


    return {

        valid: false,

        reason: "Direction unavailable"

    };

}


/* =========================================================
   STRUCTURAL STOP LOSS
   ========================================================= */

function calculateStructuralSL(
    candles,
    direction
) {

    if (
        !Array.isArray(candles) ||
        candles.length < 5
    ) {

        return null;

    }


    const structure =
        evaluateStructure(
            candles,
            direction
        );


    if (
        direction === "BUY" &&
        finite(structure.lastLow)
    ) {

        return structure.lastLow;

    }


    if (
        direction === "SELL" &&
        finite(structure.lastHigh)
    ) {

        return structure.lastHigh;

    }


    const recent =
        candles.slice(
            -Engine3Config.STRUCTURE_LOOKBACK
        );


    if (direction === "BUY") {

        const lows =
            recent
                .map(
                    candle =>
                        Number(candle.low)
                )
                .filter(finite);


        if (lows.length === 0) {
            return null;
        }


        return Math.min(...lows);

    }


    if (direction === "SELL") {

        const highs =
            recent
                .map(
                    candle =>
                        Number(candle.high)
                )
                .filter(finite);


        if (highs.length === 0) {
            return null;
        }


        return Math.max(...highs);

    }


    return null;

}


/* =========================================================
   TRADE LEVELS
   ========================================================= */

function calculateTradeLevels(
    price,
    direction,
    candles,
    sr
) {

    if (
        !finite(price) ||
        !Array.isArray(candles)
    ) {

        return {

            valid: false,

            reason:
                "Trade level data unavailable"

        };

    }


    const stopLoss =
        calculateStructuralSL(
            candles,
            direction
        );


    if (!finite(stopLoss)) {

        return {

            valid: false,

            reason:
                "Structural SL unavailable"

        };

    }


    let risk = 0;


    if (direction === "BUY") {

        risk =
            price - stopLoss;

    }


    if (direction === "SELL") {

        risk =
            stopLoss - price;

    }


    if (
        risk <= 0
    ) {

        return {

            valid: false,

            reason:
                "Invalid structural SL",

            stopLoss

        };

    }


    const target =
        direction === "BUY"
            ? price +
              (
                  risk *
                  Engine3Config.MIN_RR
              )
            : price -
              (
                  risk *
                  Engine3Config.MIN_RR
              );


    const reward =
        Math.abs(
            target - price
        );


    const rr =
        reward / risk;


    /* -----------------------------------------------------
       Check S/R obstruction
       ----------------------------------------------------- */

    let srBlocked = false;


    if (
        sr &&
        finite(sr.support) &&
        finite(sr.resistance)
    ) {

        if (direction === "BUY") {

            if (
                sr.resistance > price &&
                sr.resistance < target
            ) {

                srBlocked = true;

            }

        }


        if (direction === "SELL") {

            if (
                sr.support < price &&
                sr.support > target
            ) {

                srBlocked = true;

            }

        }

    }


    const valid =
        rr >=
            Engine3Config.MIN_RR &&
        !srBlocked;


    return {

        valid,

        entry:
            price,

        stopLoss,

        target,

        risk,

        reward,

        rr,

        srBlocked,

        reason:
            srBlocked
                ? "Target blocked by S/R"
                : valid
                    ? `Valid R:R ${rr.toFixed(2)}`
                    : "R:R below minimum"

    };

}


/* =========================================================
   SESSION CONTEXT
   IST = UTC + 5:30
   SESSION DOES NOT BLOCK TRADES
   ========================================================= */

function getTradingSession() {

    const now =
        new Date();


    const utcHours =
        now.getUTCHours();


    const utcMinutes =
        now.getUTCMinutes();


    const decimalUTC =
        utcHours +
        utcMinutes / 60;


    let name =
        "OFF / TRANSITION";


    let context =
        "Low-liquidity or transition period";


    /*
       TOKYO
       Approx. 00:00–09:00 UTC
    */

    if (
        decimalUTC >= 0 &&
        decimalUTC < 9
    ) {

        name =
            "TOKYO";

        context =
            "Asian session";

    }


    /*
       LONDON
       Approx. 08:00–17:00 UTC
    */

    if (
        decimalUTC >= 8 &&
        decimalUTC < 17
    ) {

        name =
            "LONDON";

        context =
            "European session";

    }


    /*
       NEW YORK
       Approx. 13:00–22:00 UTC
    */

    if (
        decimalUTC >= 13 &&
        decimalUTC < 22
    ) {

        name =
            "NEW YORK";

        context =
            "US session";

    }


    /*
       LONDON + NEW YORK OVERLAP
    */

    if (
        decimalUTC >= 13 &&
        decimalUTC < 17
    ) {

        name =
            "LONDON + NEW YORK";

        context =
            "Major session overlap";

    }


    MarketState.session = {

        name,

        active:
            name !==
            "OFF / TRANSITION",

        context

    };


    return MarketState.session;

}


/* =========================================================
   SESSION DISPLAY
   ========================================================= */

function updateSessionDisplay() {

    const session =
        getTradingSession();


    /*
       Different possible IDs are updated
       without requiring HTML changes.
    */

    setText(
        "session",
        session.name
    );


    setText(
        "sessionName",
        session.name
    );


    setText(
        "sessionStatus",
        session.context
    );


    setText(
        "sessionContext",
        session.context
    );

}


/* =========================================================
   NEWS BLOCKER
   ========================================================= */

function evaluateNewsBlocker() {

    /*
       IMPORTANT:

       No fake news data.

       Until a real economic calendar is connected,
       status remains UNKNOWN.

       UNKNOWN = WAIT, not BUY/SELL.
    */


    const news =
        MarketState.news;


    if (
        !news ||
        news.status === "UNKNOWN"
    ) {

        return {

            valid: false,

            blocked: true,

            unknown: true,

            reason:
                "High-impact news status unavailable"

        };

    }


    if (
        news.highImpact === true ||
        news.blocked === true
    ) {

        return {

            valid: false,

            blocked: true,

            unknown: false,

            reason:
                "High-impact news blocker active"

        };

    }


    return {

        valid: true,

        blocked: false,

        unknown: false,

        reason:
            "No blocking high-impact news detected"

    };

}


/* =========================================================
   DETERMINE ENGINE 3 DIRECTION
   ========================================================= */

function determineEngine3Direction() {

    const higherTF =
        evaluateHigherTimeframeAgreement();


    if (!higherTF.valid) {

        return {

            direction: "WAIT",

            reason:
                "H4 + H1 agreement required"

        };

    }


    const direction =
        higherTF.direction;


    const structure =
        evaluateMultiTimeframeStructure(
            direction
        );


    if (!structure.valid) {

        return {

            direction: "WAIT",

            reason:
                "M15 + M5 structure not confirmed"

        };

    }


    return {

        direction,

        reason:
            "Higher timeframe and structure agree"

    };

}


/* =========================================================
   ENGINE 1
   ========================================================= */

function runEngine1() {

    /*
       Foundation only.

       Engine 1 should remain separate from
       Engine 3 hard protections.
    */

    return {

        name:
            "ENGINE 1 — A+ SNIPER",

        status:
            "WAITING",

        direction:
            "WAIT",

        score: 0,

        reason:
            "Awaiting complete market-data engine"

    };

}


/* =========================================================
   ENGINE 2
   ========================================================= */

function runEngine2() {

    return {

        name:
            "ENGINE 2 — SCALP",

        status:
            "WAITING",

        direction:
            "WAIT",

        score: 0,

        reason:
            "Awaiting complete market-data engine"

    };

}


/* =========================================================
   ENGINE 3 — ELITE TRADE GATE
   ========================================================= */

function evaluateTradeGate(
    direction
) {

    if (
        direction !== "BUY" &&
        direction !== "SELL"
    ) {

        return {

            approved: false,

            status: "WAIT",

            direction: "WAIT",

            score: 0,

            reasons: [
                "No valid trade direction"
            ]

        };

    }


    /* -----------------------------------------------------
       DATA
       ----------------------------------------------------- */

    const m5 =
        MarketState.candles.M5;


    const m15 =
        MarketState.candles.M15;


    if (
        !Array.isArray(m5) ||
        m5.length < 20
    ) {

        return {

            approved: false,

            status: "WAIT",

            direction,

            score: 0,

            reasons: [
                "Insufficient M5 data"
            ]

        };

    }


    const price =
        finite(MarketState.livePrice)
            ? Number(
                MarketState.livePrice
              )
            : Number(
                m5[m5.length - 1].close
              );


    const closes =
        m5
            .map(
                candle =>
                    Number(candle.close)
            )
            .filter(finite);


    const ema20 =
        calculateEMA(
            closes,
            20
        );


    const ema50 =
        calculateEMA(
            closes,
            50
        );


    const ema200 =
        calculateEMA(
            closes,
            200
        );


    const rsi =
        calculateRSI(
            closes,
            14
        );


    const atr =
        calculateATR(
            m5,
            14
        );


    const momentum =
        evaluateMomentum(
            m5,
            direction
        );


    const candleQuality =
        evaluateCandleQuality(
            m5
        );


    const emaAlignment =
        evaluateEMAAlignment(
            price,
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


    const emaExtension =
        evaluateEMAExtension(
            price,
            ema20,
            atr,
            direction
        );


    const structure =
        evaluateMultiTimeframeStructure(
            direction
        );


    const higherTF =
        evaluateHigherTimeframeAgreement();


    const sr =
        calculateSupportResistance(
            m15.length >= 10
                ? m15
                : m5
        );


    const srValidation =
        evaluateSRValidation(
            price,
            direction,
            sr
        );


    const tradeLevels =
        calculateTradeLevels(
            price,
            direction,
            m5,
            sr
        );


    const news =
        evaluateNewsBlocker();


    /* -----------------------------------------------------
       REVERSAL
       ----------------------------------------------------- */

    let reversal = {

        valid: false,

        reason:
            "Normal RSI condition"

    };


    if (
        rsiProtection.reversalCandidate
    ) {

        reversal =
            detectAPlusReversal(
                m5,
                direction
            );

    }


    /* -----------------------------------------------------
       SCORE
       ----------------------------------------------------- */

    let score = 0;


    const reasons = [];


    /*
       H4 + H1
       +2
    */

    if (
        higherTF.valid
    ) {

        score += 2;

        reasons.push(
            "H4 + H1 aligned"
        );

    }


    /*
       M15 + M5 structure
       +2
    */

    if (
        structure.valid
    ) {

        score += 2;

        reasons.push(
            "M15 + M5 structure confirmed"
        );

    }


    /*
       EMA alignment
       +2
    */

    if (
        emaAlignment.valid
    ) {

        score += 2;

        reasons.push(
            "EMA alignment confirmed"
        );

    }


    /*
       Momentum
       +1
    */

    if (
        momentum.valid
    ) {

        score += 1;

        reasons.push(
            "Momentum confirmed"
        );

    }


    /*
       Candle quality
       +1
    */

    if (
        candleQuality.valid
    ) {

        score += 1;

        reasons.push(
            "Candle quality confirmed"
        );

    }


    /*
       RSI
       +1
    */

    if (
        rsiProtection.valid &&
        !rsiProtection.reversalCandidate
    ) {

        score += 1;

        reasons.push(
            "RSI safe"
        );

    }


    /*
       A+ reversal
       +2
       only if RSI is extreme
    */

    if (
        rsiProtection.reversalCandidate &&
        reversal.valid
    ) {

        score += 2;

        reasons.push(
            "A+ RSI reversal confirmed"
        );

    }


    /*
       S/R
       +1
    */

    if (
        srValidation.valid
    ) {

        score += 1;

        reasons.push(
            "S/R room confirmed"
        );

    }


    /*
       R:R
       +1
    */

    if (
        tradeLevels.valid
    ) {

        score += 1;

        reasons.push(
            "Minimum 1:2 R:R confirmed"
        );

    }


    /* -----------------------------------------------------
       HARD BLOCKS
       ----------------------------------------------------- */

    const hardBlocks = [];


    if (
        rsiProtection.hardBlock
    ) {

        hardBlocks.push(
            rsiProtection.reason
        );

    }


    if (
        emaExtension.hardBlock
    ) {

        hardBlocks.push(
            emaExtension.reason
        );

    }


    if (
        !higherTF.valid
    ) {

        hardBlocks.push(
            "H4 + H1 agreement failed"
        );

    }


    if (
        !structure.valid
    ) {

        hardBlocks.push(
            "M15 + M5 structure failed"
        );

    }


    if (
        !tradeLevels.valid
    ) {

        hardBlocks.push(
            tradeLevels.reason
        );

    }


    if (
        Engine3Config.NEWS_BLOCKER &&
        news.blocked
    ) {

        hardBlocks.push(
            news.reason
        );

    }


    /* -----------------------------------------------------
       NEWS UNKNOWN = WAIT
       Not a fake approval.
       ----------------------------------------------------- */

    if (
        Engine3Config.NEWS_BLOCKER &&
        news.unknown
    ) {

        return {

            approved: false,

            status: "WAIT — NEWS UNKNOWN",

            direction,

            score,

            requiredScore:
                Engine3Config.REQUIRED_SCORE,

            hardBlocked: true,

            hardBlocks: [
                "Real high-impact news data unavailable"
            ],

            reasons,

            price,

            rsi,

            ema20,

            ema50,

            ema200,

            atr,

            momentum:
                momentum.momentum,

            sr,

            tradeLevels,

            higherTF,

            structure,

            emaAlignment,

            rsiProtection,

            emaExtension,

            candleQuality,

            news,

            session:
                MarketState.session

        };

    }


    /* -----------------------------------------------------
       FINAL DECISION
       ----------------------------------------------------- */

    const approved =
        hardBlocks.length === 0 &&
        score >=
            Engine3Config.REQUIRED_SCORE;


    let status =
        approved
            ? "A+ APPROVED"
            : "WAIT";


    if (
        hardBlocks.length > 0
    ) {

        status =
            "BLOCKED";

    }


    return {

        approved,

        status,

        direction,

        score,

        requiredScore:
            Engine3Config.REQUIRED_SCORE,

        hardBlocked:
            hardBlocks.length > 0,

        hardBlocks,

        reasons,

        price,

        rsi,

        ema20,

        ema50,

        ema200,

        atr,

        momentum:
            momentum.momentum,

        sr,

        tradeLevels,

        higherTF,

        structure,

        emaAlignment,

        rsiProtection,

        emaExtension,

        candleQuality,

        news,

        session:
            MarketState.session

    };

}


/* =========================================================
   ENGINE 3 RUNNER
   ========================================================= */

function runEngine3() {

    updateSessionDisplay();


    const directionResult =
        determineEngine3Direction();


    if (
        directionResult.direction === "WAIT"
    ) {

        const result = {

            approved: false,

            status: "WAIT",

            direction: "WAIT",

            score: 0,

            reason:
                directionResult.reason

        };


        MarketState.engine3 =
            result;


        updateEngine3Display(
            result
        );


        return result;

    }


    const result =
        evaluateTradeGate(
            directionResult.direction
        );


    MarketState.engine3 =
        result;


    updateEngine3Display(
        result
    );


    return result;

}


/* =========================================================
   ENGINE 3 DISPLAY
   ========================================================= */

function updateEngine3Display(
    result
) {

    if (!result) return;


    setText(
        "engine3Status",
        result.status || "WAIT"
    );


    setText(
        "engine3Direction",
        result.direction || "WAIT"
    );


    setText(
        "engine3Score",
        `${result.score || 0}/${Engine3Config.REQUIRED_SCORE}`
    );


    if (
        result.rsiProtection
    ) {

        setText(
            "rsiProtection",
            result.rsiProtection.status
        );

    }


    if (
        result.emaExtension
    ) {

        setText(
            "emaExtension",
            result.emaExtension.valid
                ? "SAFE"
                : "BLOCKED"
        );

    }


    if (
        result.tradeLevels
    ) {

        setText(
            "tradeRR",
            finite(result.tradeLevels.rr)
                ? result.tradeLevels.rr.toFixed(2)
                : "—"
        );


        setText(
            "entryPrice",
            finite(result.tradeLevels.entry)
                ? result.tradeLevels.entry.toFixed(5)
                : "—"
        );


        setText(
            "stopLoss",
            finite(result.tradeLevels.stopLoss)
                ? result.tradeLevels.stopLoss.toFixed(5)
                : "—"
        );


        setText(
            "takeProfit",
            finite(result.tradeLevels.target)
                ? result.tradeLevels.target.toFixed(5)
                : "—"
        );

    }


    if (
        result.news
    ) {

        setText(
            "newsStatus",
            result.news.unknown
                ? "UNKNOWN"
                : result.news.blocked
                    ? "BLOCKED"
                    : "CLEAR"
        );

    }

}


/* =========================================================
   CHECKLIST DISPLAY
   ========================================================= */

function displayCheck(
    id,
    valid,
    text
) {

    const element =
        document.getElementById(id);


    if (!element) return;


    element.textContent =
        valid
            ? `✓ ${text}`
            : `✕ ${text}`;


    element.dataset.status =
        valid
            ? "PASS"
            : "FAIL";

}


/* =========================================================
   ENGINE 3 CHECKLIST
   ========================================================= */

function updateChecklistDisplay(
    result
) {

    if (!result) return;


    displayCheck(
        "checkHTF",
        result.higherTF
            ? result.higherTF.valid
            : false,
        "H4 + H1 direction"
    );


    displayCheck(
        "checkStructure",
        result.structure
            ? result.structure.valid
            : false,
        "M15 + M5 structure"
    );


    displayCheck(
        "checkEMA",
        result.emaAlignment
            ? result.emaAlignment.valid
            : false,
        "M5 EMA alignment"
    );


    displayCheck(
        "checkRSI",
        result.rsiProtection
            ? result.rsiProtection.valid
            : false,
        "RSI safety"
    );


    displayCheck(
        "checkEMAExtension",
        result.emaExtension
            ? result.emaExtension.valid
            : false,
        "EMA extension"
    );


    displayCheck(
        "checkMomentum",
        result.momentum
            ? true
            : false,
        "Momentum"
    );


    displayCheck(
        "checkCandle",
        result.candleQuality
            ? result.candleQuality.valid
            : false,
        "Candle quality"
    );


    displayCheck(
        "checkSR",
        result.srValidation
            ? result.srValidation.valid
            : false,
        "Support / Resistance"
    );


    displayCheck(
        "checkRR",
        result.tradeLevels
            ? result.tradeLevels.valid
            : false,
        "Real R:R"
    );


    displayCheck(
        "checkNews",
        result.news
            ? !result.news.unknown &&
              !result.news.blocked
            : false,
        "News blocker"
    );


    displayCheck(
        "checkSession",
        true,
        "Session context"
    );

}


/* =========================================================
   RUN ALL ENGINES
   ========================================================= */

function runAllEngines() {

    updateSessionDisplay();


    MarketState.engine1 =
        runEngine1();


    MarketState.engine2 =
        runEngine2();


    const engine3 =
        runEngine3();


    updateChecklistDisplay(
        engine3
    );


    return {

        engine1:
            MarketState.engine1,

        engine2:
            MarketState.engine2,

        engine3

    };

}


/* =========================================================
   M5 INDICATORS
   ========================================================= */

function calculateM5Indicators() {

    const candles =
        MarketState.candles.M5;


    if (
        !Array.isArray(candles) ||
        candles.length === 0
    ) {

        return;

    }


    const closes =
        candles
            .map(
                candle =>
                    Number(candle.close)
            )
            .filter(finite);


    if (
        closes.length === 0
    ) {

        return;

    }


    const ema20 =
        calculateEMA(
            closes,
            20
        );


    const ema50 =
        calculateEMA(
            closes,
            50
        );


    const ema200 =
        calculateEMA(
            closes,
            200
        );


    const rsi =
        calculateRSI(
            closes,
            14
        );


    const momentum =
        calculateMomentum(
            closes,
            5
        );


    const atr =
        calculateATR(
            candles,
            14
        );


    MarketState.indicators = {

        EMA20: ema20,

        EMA50: ema50,

        EMA200: ema200,

        RSI14: rsi,

        momentum,

        ATR14: atr

    };


    setText(
        "ema20",
        finite(ema20)
            ? ema20.toFixed(5)
            : "—"
    );


    setText(
        "ema50",
        finite(ema50)
            ? ema50.toFixed(5)
            : "—"
    );


    setText(
        "ema200",
        finite(ema200)
            ? ema200.toFixed(5)
            : "—"
    );


    setText(
        "rsi",
        finite(rsi)
            ? rsi.toFixed(2)
            : "—"
    );


    setText(
        "momentum",
        finite(momentum)
            ? momentum.toFixed(5)
            : "—"
    );

}


/* =========================================================
   WAITING STATE
   ========================================================= */

function setWaitingState() {

    MarketState.connected =
        false;


    updateDataStatus(
        "DATA ENGINE: WAITING"
    );


    setText(
        "candleStatus",
        "WAITING"
    );


    updateSessionDisplay();

}


/* =========================================================
   MARKET DATA
   =========================================================

   IMPORTANT:

   No fake market data is generated.

   The real Twelve Data / secure backend connection
   must populate:

       MarketState.livePrice

       MarketState.candles.H4
       MarketState.candles.H1
       MarketState.candles.M15
       MarketState.candles.M5

   before the engines can produce a real signal.

   ========================================================= */

async function loadMarketData() {

    setWaitingState();


    console.log(
        "Market data engine waiting for secure connection."
    );


    /*
       DO NOT CREATE FAKE DATA HERE.
    */

}


/* =========================================================
   DASHBOARD REFRESH
   ========================================================= */

async function refreshDashboard() {

    await loadMarketData();


    updatePriceDisplay();


    calculateM5Indicators();


    updateM5Status();


    runAllEngines();

}


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function initializeDashboard() {

    console.log(
        "EUR/USD Sniper Dashboard — Engine 3 initialized."
    );


    setWaitingState();


    updatePriceDisplay();


    updateM5Status();


    calculateM5Indicators();


    runAllEngines();


    await loadMarketData();

}


/* =========================================================
   START
   ========================================================= */

initializeDashboard();


/* =========================================================
   PERIODIC REFRESH
   ========================================================= */

setInterval(
    refreshDashboard,
    30000
);


/* =========================================================
   PUBLIC ACCESS
   Useful for testing from browser console.
   ========================================================= */

window.MarketState =
    MarketState;


window.runEngine3 =
    runEngine3;


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
