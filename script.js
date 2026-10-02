/* =========================================================
   EUR/USD SNIPER DASHBOARD
   ENGINE 3 — ELITE TRADE GATE
   DAILY SUPPORT / RESISTANCE
   REAL R:R
   LIVE M5 FINANCIAL CHART
   EMA 20 / 50 / 200
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
        M5: [],
        D1: []
    },

    indicators: {
        EMA20: null,
        EMA50: null,
        EMA200: null,
        RSI14: null,
        momentum: null,
        ATR14: null
    },

    dailySR: null,

    connected: false,

    lastUpdate: null,

    news: {
        status: "UNKNOWN",
        blocked: true,
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

    /* RSI */

    RSI_OVERSOLD: 30,

    RSI_OVERBOUGHT: 70,

    RSI_BUY_MIN: 35,

    RSI_BUY_MAX: 68,

    RSI_SELL_MIN: 32,

    RSI_SELL_MAX: 65,


    /* EMA EXTENSION */

    EMA_EXTENSION_ATR: 1.5,


    /* RISK */

    MIN_RR: 2.0,


    /* STRUCTURE */

    STRUCTURE_LOOKBACK: 20,

    SWING_LOOKBACK: 2,


    /* MOMENTUM */

    MOMENTUM_LOOKBACK: 5,


    /* A+ SCORE */

    REQUIRED_SCORE: 8,


    /* NEWS */

    NEWS_BLOCKER: true,


    /* DAILY S/R */

    DAILY_SR_BUFFER_PERCENT: 0.10

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

    if (!el) return;

    el.textContent =
        value === null ||
        value === undefined ||
        value === ""
            ? "—"
            : value;
}


function finite(value) {

    return Number.isFinite(Number(value));

}


function formatPrice(value) {

    if (!finite(value)) return "—";

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

    if (MarketState.connected) {

        setText("chartState", "DATA: LIVE");

    } else {

        setText("chartState", "DATA: ERROR");

    }

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

    if (
        !Array.isArray(values) ||
        values.length < period
    ) {

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
   EMA SERIES
   ========================================================= */

function calculateEMASeries(candles, period) {

    if (
        !Array.isArray(candles) ||
        candles.length < period
    ) {

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

    for (
        let i = period;
        i < candles.length;
        i++
    ) {

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

    if (
        !Array.isArray(values) ||
        values.length <= period
    ) {

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

    const relativeStrength =
        averageGain /
        averageLoss;

    return 100 -
        (100 / (1 + relativeStrength));

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

        const current = candles[i];

        const previous =
            candles[i - 1];

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
            (
                atr *
                (period - 1) +
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
        Number(values[values.length - 1]);

    const previous =
        Number(
            values[
                values.length - 1 - lookback
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

    if (!candle) return "UNKNOWN";

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

        const valid =
            ema20 > ema50 &&
            ema50 > ema200;

        return {

            valid,

            status:
                valid
                    ? "BULLISH ALIGNMENT"
                    : "NOT ALIGNED"

        };

    }

    if (direction === "SELL") {

        const valid =
            ema20 < ema50 &&
            ema50 < ema200;

        return {

            valid,

            status:
                valid
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

    if (
        !candles ||
        candles.length < 20
    ) {

        return "UNKNOWN";

    }

    const closes =
        candles.map(
            c => c.close
        );

    const ema20 =
        calculateEMA(
            closes,
            20
        );

    const last =
        closes[closes.length - 1];

    if (
        !finite(ema20) ||
        !finite(last)
    ) {

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
        let i =
            index - lookback;
        i <=
            index + lookback;
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
            candles[i].high >=
            current
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
        let i =
            index - lookback;
        i <=
            index + lookback;
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
            candles[i].low <=
            current
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

function evaluateStructure(candles) {

    if (
        !Array.isArray(candles) ||
        candles.length < 10
    ) {

        return {

            direction: "UNKNOWN",

            status:
                "STRUCTURE DATA UNAVAILABLE",

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

            status:
                "WAITING FOR SWINGS",

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

            status:
                "BULLISH STRUCTURE",

            valid: true,

            swingHigh: lastHigh,

            swingLow: lastLow

        };

    }

    if (bearish) {

        return {

            direction: "SELL",

            status:
                "BEARISH STRUCTURE",

            valid: true,

            swingHigh: lastHigh,

            swingLow: lastLow

        };

    }

    return {

        direction: "NEUTRAL",

        status:
            "MIXED STRUCTURE",

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
            m15.direction ===
            m5.direction

    };

}


/* =========================================================
   MOMENTUM EVALUATION
   ========================================================= */

function evaluateMomentum(
    candles,
    direction
) {

    if (
        !candles ||
        candles.length <=
            Engine3Config.MOMENTUM_LOOKBACK
    ) {

        return {

            valid: false,

            status:
                "MOMENTUM UNAVAILABLE",

            momentum: null

        };

    }

    const closes =
        candles.map(
            c => c.close
        );

    const momentum =
        calculateMomentum(
            closes,
            Engine3Config.MOMENTUM_LOOKBACK
        );

    if (!finite(momentum)) {

        return {

            valid: false,

            status:
                "MOMENTUM UNAVAILABLE",

            momentum: null

        };

    }

    if (direction === "BUY") {

        return {

            valid:
                momentum > 0,

            status:
                momentum > 0
                    ? "BULLISH"
                    : "BEARISH",

            momentum

        };

    }

    if (direction === "SELL") {

        return {

            valid:
                momentum < 0,

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

            status:
                "RSI DATA UNAVAILABLE",

            reason:
                "RSI data unavailable"

        };

    }


    /* HARD BUY PROTECTION */

    if (
        direction === "BUY" &&
        rsi >=
            Engine3Config.RSI_OVERBOUGHT
    ) {

        return {

            valid: false,

            status:
                "BUY BLOCKED — OVERBOUGHT",

            reason:
                "RSI is too high for a fresh BUY"

        };

    }


    /* HARD SELL PROTECTION */

    if (
        direction === "SELL" &&
        rsi <=
            Engine3Config.RSI_OVERSOLD
    ) {

        return {

            valid: false,

            status:
                "SELL BLOCKED — OVERSOLD",

            reason:
                "RSI is too low for a fresh SELL"

        };

    }


    /* BUY SAFETY ZONE */

    if (direction === "BUY") {

        const valid =
            rsi >=
                Engine3Config.RSI_BUY_MIN &&
            rsi <=
                Engine3Config.RSI_BUY_MAX;

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


    /* SELL SAFETY ZONE */

    if (direction === "SELL") {

        const valid =
            rsi >=
                Engine3Config.RSI_SELL_MIN &&
            rsi <=
                Engine3Config.RSI_SELL_MAX;

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

    const range =
        last.high -
        last.low;

    if (range <= 0) {

        return {

            valid: false,

            status: "NO REVERSAL"

        };

    }

    const bullishRejection =
        last.close >
            last.open &&
        last.low <
            previous.low &&
        last.close >
            (
                last.low +
                range * 0.60
            );

    const bearishRejection =
        last.close <
            last.open &&
        last.high >
            previous.high &&
        last.close <
            (
                last.high -
                range * 0.60
            );


    if (
        direction === "BUY" &&
        bullishRejection &&
        rsi < 45
    ) {

        return {

            valid: true,

            status:
                "A+ BULLISH REVERSAL"

        };

    }


    if (
        direction === "SELL" &&
        bearishRejection &&
        rsi > 55
    ) {

        return {

            valid: true,

            status:
                "A+ BEARISH REVERSAL"

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

            status:
                "EMA EXTENSION DATA UNAVAILABLE"

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
   DAILY SUPPORT / RESISTANCE
   =========================================================

   Uses PREVIOUS COMPLETED DAILY CANDLE.

   PDH = Previous Day High
   PDL = Previous Day Low
   PDC = Previous Day Close

   Pivot:
   P = (PDH + PDL + PDC) / 3

   R1 = 2P - PDL
   R2 = P + (PDH - PDL)
   R3 = PDH + 2(P - PDL)

   S1 = 2P - PDH
   S2 = P - (PDH - PDL)
   S3 = PDL - 2(PDH - P)

   ========================================================= */

function calculateDailySupportResistance(
    dailyCandles,
    currentPrice
) {

    if (
        !Array.isArray(dailyCandles) ||
        dailyCandles.length < 2 ||
        !finite(currentPrice)
    ) {

        return {

            valid: false,

            pdh: null,

            pdl: null,

            pdc: null,

            pivot: null,

            r1: null,

            r2: null,

            r3: null,

            s1: null,

            s2: null,

            s3: null,

            nearestResistance: null,

            nextResistance: null,

            nearestSupport: null,

            nextSupport: null

        };

    }


    /*
       Twelve Data returns newest
       records first.

       Therefore index 0 =
       current/latest daily candle.

       Index 1 =
       previous completed daily candle.
    */

    const previousDay =
        dailyCandles[1];


    const pdh =
        Number(previousDay.high);

    const pdl =
        Number(previousDay.low);

    const pdc =
        Number(previousDay.close);


    if (
        !finite(pdh) ||
        !finite(pdl) ||
        !finite(pdc)
    ) {

        return {

            valid: false

        };

    }


    const pivot =
        (pdh + pdl + pdc) / 3;


    const r1 =
        (2 * pivot) - pdl;

    const r2 =
        pivot + (pdh - pdl);

    const r3 =
        pdh + 2 * (pivot - pdl);


    const s1 =
        (2 * pivot) - pdh;

    const s2 =
        pivot - (pdh - pdl);

    const s3 =
        pdl - 2 * (pdh - pivot);


    const resistanceLevels = [

        {
            name: "R1",
            price: r1
        },

        {
            name: "R2",
            price: r2
        },

        {
            name: "R3",
            price: r3
        }

    ]
    .filter(
        level =>
            finite(level.price) &&
            level.price > currentPrice
    )
    .sort(
        (a,b) =>
            a.price - b.price
    );


    const supportLevels = [

        {
            name: "S1",
            price: s1
        },

        {
            name: "S2",
            price: s2
        },

        {
            name: "S3",
            price: s3
        }

    ]
    .filter(
        level =>
            finite(level.price) &&
            level.price < currentPrice
    )
    .sort(
        (a,b) =>
            b.price - a.price
    );


    return {

        valid: true,

        pdh,

        pdl,

        pdc,

        pivot,

        r1,

        r2,

        r3,

        s1,

        s2,

        s3,

        nearestResistance:
            resistanceLevels[0] || null,

        nextResistance:
            resistanceLevels[1] || null,

        nearestSupport:
            supportLevels[0] || null,

        nextSupport:
            supportLevels[1] || null

    };

}


/* =========================================================
   DAILY S/R VALIDATION
   =========================================================

   IMPORTANT:

   Daily S/R is NOT a universal blocker.

   BUY:
   - Need enough room to nearest resistance.
   - Do not BUY directly underneath resistance.

   SELL:
   - Need enough room to nearest support.
   - Do not SELL directly above support.

   ========================================================= */

function evaluateDailySRValidation(
    price,
    dailySR,
    direction
) {

    if (
        !finite(price) ||
        !dailySR ||
        !dailySR.valid
    ) {

        return {

            valid: false,

            status:
                "DAILY S/R UNAVAILABLE",

            reason:
                "Daily levels unavailable"

        };

    }


    if (direction === "BUY") {

        const resistance =
            dailySR.nearestResistance;

        if (
            !resistance ||
            !finite(resistance.price)
        ) {

            return {

                valid: true,

                status:
                    "BUY — NO NEAR DAILY RESISTANCE",

                reason:
                    "No calculated daily resistance above price"

            };

        }


        const room =
            resistance.price -
            price;

        const dailyRange =
            Math.abs(
                dailySR.pdh -
                dailySR.pdl
            );

        const minimumRoom =
            dailyRange *
            Engine3Config
                .DAILY_SR_BUFFER_PERCENT;


        if (room <= minimumRoom) {

            return {

                valid: false,

                status:
                    `BUY TOO CLOSE TO ${resistance.name}`,

                reason:
                    "Insufficient room before daily resistance",

                level:
                    resistance.price,

                room

            };

        }


        return {

            valid: true,

            status:
                `BUY — ROOM TO ${resistance.name}`,

            reason:
                "Enough room before daily resistance",

            level:
                resistance.price,

            room

        };

    }


    if (direction === "SELL") {

        const support =
            dailySR.nearestSupport;

        if (
            !support ||
            !finite(support.price)
        ) {

            return {

                valid: true,

                status:
                    "SELL — NO NEAR DAILY SUPPORT",

                reason:
                    "No calculated daily support below price"

            };

        }


        const room =
            price -
            support.price;

        const dailyRange =
            Math.abs(
                dailySR.pdh -
                dailySR.pdl
            );

        const minimumRoom =
            dailyRange *
            Engine3Config
                .DAILY_SR_BUFFER_PERCENT;


        if (room <= minimumRoom) {

            return {

                valid: false,

                status:
                    `SELL TOO CLOSE TO ${support.name}`,

                reason:
                    "Insufficient room before daily support",

                level:
                    support.price,

                room

            };

        }


        return {

            valid: true,

            status:
                `SELL — ROOM TO ${support.name}`,

            reason:
                "Enough room before daily support",

            level:
                support.price,

            room

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
   REAL DAILY TARGET + R:R
   ========================================================= */

function calculateTradeLevels(
    entry,
    sl,
    direction,
    dailySR
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

            rr: null,

            targetName: null

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

            rr: null,

            targetName: null

        };

    }


    let tp1 = null;

    let tp2 = null;

    let targetName = null;

    let secondTargetName = null;


    /* =====================================================
       BUY
       ===================================================== */

    if (direction === "BUY") {

        if (
            dailySR &&
            dailySR.nearestResistance
        ) {

            tp1 =
                dailySR.nearestResistance.price;

            targetName =
                dailySR.nearestResistance.name;

        }


        if (
            dailySR &&
            dailySR.nextResistance
        ) {

            tp2 =
                dailySR.nextResistance.price;

            secondTargetName =
                dailySR.nextResistance.name;

        }


        /*
           If no daily resistance is available,
           use a 2R fallback target.

           This is NOT forced when a daily
           resistance exists.
        */

        if (!finite(tp1)) {

            tp1 =
                entry +
                risk * 2;

            targetName =
                "2R FALLBACK";

        }

        if (!finite(tp2)) {

            tp2 =
                entry +
                risk * 3;

            secondTargetName =
                "3R FALLBACK";

        }


        if (tp1 <= entry) {

            return {

                valid: false,

                entry,

                sl,

                tp1,

                tp2,

                rr: null,

                targetName,

                secondTargetName

            };

        }

    }


    /* =====================================================
       SELL
       ===================================================== */

    if (direction === "SELL") {

        if (
            dailySR &&
            dailySR.nearestSupport
        ) {

            tp1 =
                dailySR.nearestSupport.price;

            targetName =
                dailySR.nearestSupport.name;

        }


        if (
            dailySR &&
            dailySR.nextSupport
        ) {

            tp2 =
                dailySR.nextSupport.price;

            secondTargetName =
                dailySR.nextSupport.name;

        }


        /*
           If no daily support is available,
           use a 2R fallback target.
        */

        if (!finite(tp1)) {

            tp1 =
                entry -
                risk * 2;

            targetName =
                "2R FALLBACK";

        }

        if (!finite(tp2)) {

            tp2 =
                entry -
                risk * 3;

            secondTargetName =
                "3R FALLBACK";

        }


        if (tp1 >= entry) {

            return {

                valid: false,

                entry,

                sl,

                tp1,

                tp2,

                rr: null,

                targetName,

                secondTargetName

            };

        }

    }


    const reward =
        Math.abs(
            tp1 -
            entry
        );


    const rr =
        reward /
        risk;


    return {

        valid:
            rr >=
            Engine3Config.MIN_RR,

        entry,

        sl,

        tp1,

        tp2,

        rr,

        targetName,

        secondTargetName

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


    let name =
        "OFF / TRANSITION";

    let context =
        "Low-priority trading period";


    if (
        utcHour >= 7 &&
        utcHour < 12
    ) {

        name =
            "LONDON";

        context =
            "European liquidity";

    }

    else if (
        utcHour >= 12 &&
        utcHour < 16
    ) {

        name =
            "LONDON + NEW YORK";

        context =
            "Major overlap";

    }

    else if (
        utcHour >= 16 &&
        utcHour < 21
    ) {

        name =
            "NEW YORK";

        context =
            "US liquidity";

    }


    return {

        name,

        active:
            name !==
            "OFF / TRANSITION",

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
       Real economic calendar is not connected yet.

       Therefore the system MUST NOT assume
       that news is clear.

       This remains a hard blocker.
    */

    MarketState.news.status =
        "UNKNOWN";

    MarketState.news.blocked =
        true;


    return {

        valid: false,

        status:
            "NEWS UNKNOWN",

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
            direction.direction ===
            "WAIT"
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


    if (
        !m5 ||
        m5.length < 20
    ) {

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
            direction ===
            "UNKNOWN"
                ? "WAIT"
                : "ANALYSIS",

        direction,

        reason:
            "Engine 2 scalp foundation active"

    };

}


/* =========================================================
   ENGINE 3 — ELITE TRADE GATE
   ========================================================= */

function evaluateTradeGate() {

    const m5 =
        MarketState.candles.M5;


    if (
        !m5 ||
        m5.length < 200
    ) {

        return {

            decision: "WAIT",

            direction: "WAIT",

            score: 0,

            reason:
                "Not enough M5 data",

            valid: false

        };

    }


    /* =====================================================
       DIRECTION
       ===================================================== */

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

            valid: false,

            directionCheck: false,

            structureCheck: false,

            emaCheck: false,

            rsiCheck: false,

            rsiProtection: {
                valid: false,
                status: "PENDING"
            },

            momentumCheck: false,

            momentum: {
                valid: false,
                status: "PENDING"
            },

            candleCheck: false,

            candle: {
                valid: false,
                quality: "PENDING"
            },

            extensionCheck: false,

            extension: {
                valid: false,
                status: "PENDING"
            },

            sessionCheck: false,

            session:
                getTradingSession(),

            srCheck: false,

            srValidation: {
                valid: false,
                status: "PENDING"
            },

            newsCheck: false,

            news: {
                valid: false,
                status: "UNKNOWN"
            },

            slCheck: false,

            rrCheck: false,

            levels: {
                valid: false
            },

            reversal: {
                valid: false,
                status: "PENDING"
            }

        };

    }


    /* =====================================================
       M5 INDICATORS
       ===================================================== */

    const closes =
        m5.map(
            c => c.close
        );


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


    /* =====================================================
       CORE CHECKS
       ===================================================== */

    const momentum =
        evaluateMomentum(
            m5,
            direction
        );


    const lastCandle =
        m5[m5.length - 1];


    const candle =
        evaluateCandleQuality(
            lastCandle
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


    /* =====================================================
       DAILY S/R
       ===================================================== */

    const dailySR =
        MarketState.dailySR;


    const srValidation =
        evaluateDailySRValidation(
            MarketState.livePrice,
            dailySR,
            direction
        );


    /* =====================================================
       STRUCTURAL SL
       ===================================================== */

    const sl =
        calculateStructuralSL(
            m5,
            direction,
            MarketState.livePrice,
            atr
        );


    /* =====================================================
       REAL DAILY TARGET + R:R
       ===================================================== */

    const levels =
        calculateTradeLevels(
            MarketState.livePrice,
            sl,
            direction,
            dailySR
        );


    /* =====================================================
       SCORE
       ===================================================== */

    let score = 0;


    if (
        directionResult.direction ===
        direction
    ) {

        score++;

    }


    if (structure.valid) {

        score++;

    }


    if (emaAlignment.valid) {

        score++;

    }


    if (rsiProtection.valid) {

        score++;

    }


    if (momentum.valid) {

        score++;

    }


    if (candle.valid) {

        score++;

    }


    if (extension.valid) {

        score++;

    }


    if (session.active) {

        score++;

    }


    if (srValidation.valid) {

        score++;

    }


    if (levels.valid) {

        score++;

    }


    if (reversal.valid) {

        score++;

    }


    /* =====================================================
       RESULT OBJECT
       ===================================================== */

    const baseResult = {

        decision: "WAIT",

        direction,

        score,

        reason:
            "A+ conditions not confirmed",

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


        reversal,


        dailySR

    };


    /* =====================================================
       HARD RSI BLOCK
       ===================================================== */

    if (!rsiProtection.valid) {

        return {

            ...baseResult,

            decision:
                direction === "BUY"
                    ? "BLOCKED BUY"
                    : "BLOCKED SELL",

            reason:
                rsiProtection.status

        };

    }


    /* =====================================================
       HARD EMA EXTENSION BLOCK
       ===================================================== */

    if (!extension.valid) {

        return {

            ...baseResult,

            decision: "WAIT",

            reason:
                "EMA extension protection active"

        };

    }


    /* =====================================================
       HARD DAILY S/R LOCATION BLOCK
       ===================================================== */

    if (!srValidation.valid) {

        return {

            ...baseResult,

            decision: "WAIT",

            reason:
                srValidation.status

        };

    }


    /* =====================================================
       HARD NEWS BLOCK
       ===================================================== */

    if (
        Engine3Config.NEWS_BLOCKER &&
        !news.valid
    ) {

        return {

            ...baseResult,

            decision: "WAIT",

            reason:
                "WAIT — NEWS UNKNOWN"

        };

    }


    /* =====================================================
       HARD REAL R:R BLOCK
       ===================================================== */

    if (!levels.valid) {

        return {

            ...baseResult,

            decision: "WAIT",

            reason:
                "Real R:R below minimum 1:2"

        };

    }


    /* =====================================================
       FINAL A+ DECISION
       ===================================================== */

    const approved =
        score >=
        Engine3Config.REQUIRED_SCORE;


    return {

        ...baseResult,

        decision:
            approved
                ? direction
                : "WAIT",

        reason:
            approved
                ? "A+ conditions confirmed"
                : "A+ score not reached",

        valid:
            approved

    };

}


/* =========================================================
   ENGINE 3 DISPLAY
   ========================================================= */

function updateEngine3Display(result) {

    if (!result) return;


    setText(
        "decision",
        result.decision
    );


    setText(
        "decisionReason",
        result.reason
    );


    /*
       REAL SCORE = 11 CONDITIONS
    */

    setText(
        "score",
        `${result.score} / 11`
    );


    const scoreFill =
        document.getElementById(
            "scoreFill"
        );


    if (scoreFill) {

        const percentage =
            Math.min(
                100,
                (result.score / 11) *
                100
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
        finite(result.levels?.rr)
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
            status ||
            "PENDING";


        statusEl.style.color =
            valid
                ? "#00e59a"
                : "#ffc83d";

    }

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
        formatPrice(
            h4.swingHigh
        )
    );


    setText(
        "h4Low",
        formatPrice(
            h4.swingLow
        )
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
        formatPrice(
            h1.swingHigh
        )
    );


    setText(
        "h1Low",
        formatPrice(
            h1.swingLow
        )
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
        MarketState.candles.M15.map(
            c => c.close
        );


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
        MarketState.candles.M5.map(
            c => c.close
        );


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
            Engine3Config
                .MOMENTUM_LOOKBACK
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
   DAILY S/R DISPLAY
   ========================================================= */

function updateSRDisplay() {

    const sr =
        MarketState.dailySR;


    if (
        !sr ||
        !sr.valid
    ) {

        setText(
            "resistance1",
            "—"
        );

        setText(
            "resistance2",
            "—"
        );

        setText(
            "support1",
            "—"
        );

        setText(
            "support2",
            "—"
        );

        updatePriceDisplay();

        return;

    }


    /*
       Dashboard has four S/R fields.

       Display nearest two DAILY
       resistance levels and nearest
       two DAILY support levels.
    */

    setText(
        "resistance1",
        sr.nearestResistance
            ? `${sr.nearestResistance.name} ${formatPrice(sr.nearestResistance.price)}`
            : "—"
    );


    setText(
        "resistance2",
        sr.nextResistance
            ? `${sr.nextResistance.name} ${formatPrice(sr.nextResistance.price)}`
            : "—"
    );


    setText(
        "support1",
        sr.nearestSupport
            ? `${sr.nearestSupport.name} ${formatPrice(sr.nearestSupport.price)}`
            : "—"
    );


    setText(
        "support2",
        sr.nextSupport
            ? `${sr.nextSupport.name} ${formatPrice(sr.nextSupport.price)}`
            : "—"
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

    if (!datetime) return null;


    let text =
        String(datetime)
            .trim();


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


    if (
        !Number.isFinite(
            timestamp
        )
    ) {

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


    if (
        ChartState.initialized
    ) {

        return;

    }


    const message =
        document.getElementById(
            "chartMessage"
        );


    if (message) {

        message.style.zIndex =
            "0";

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

                    textColor:
                        "#91afc2"

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


    ChartState.candleSeries =
        ChartState.chart.addSeries(
            LightweightCharts.CandlestickSeries,
            {

                upColor:
                    "#00e59a",

                downColor:
                    "#ff405d",

                borderVisible:
                    false,

                wickUpColor:
                    "#00e59a",

                wickDownColor:
                    "#ff405d"

            }
        );


    ChartState.ema20Series =
        ChartState.chart.addSeries(
            LightweightCharts.LineSeries,
            {

                color:
                    "#20d9ff",

                lineWidth:
                    2,

                title:
                    "EMA 20",

                lastValueVisible:
                    false,

                priceLineVisible:
                    false

            }
        );


    ChartState.ema50Series =
        ChartState.chart.addSeries(
            LightweightCharts.LineSeries,
            {

                color:
                    "#ffc83d",

                lineWidth:
                    2,

                title:
                    "EMA 50",

                lastValueVisible:
                    false,

                priceLineVisible:
                    false

            }
        );


    ChartState.ema200Series =
        ChartState.chart.addSeries(
            LightweightCharts.LineSeries,
            {

                color:
                    "#ff9f1c",

                lineWidth:
                    2,

                title:
                    "EMA 200",

                lastValueVisible:
                    false,

                priceLineVisible:
                    false

            }
        );


    ChartState.initialized =
        true;


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
        !finite(
            MarketState.livePrice
        )
    ) {

        return;

    }


    if (
        ChartState.livePriceLine
    ) {

        try {

            ChartState.candleSeries
                .removePriceLine(
                    ChartState.livePriceLine
                );

        } catch (error) {

            console.warn(
                "Could not remove old price line."
            );

        }

    }


    ChartState.livePriceLine =
        ChartState.candleSeries
            .createPriceLine({

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

            });

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


    for (
        const candle of candles
    ) {

        const time =
            candle.chartTime ||
            convertCandleTime(
                candle.datetime
            );


        if (!time) continue;


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


    chartCandles.sort(
        (a,b) =>
            a.time - b.time
    );


    const uniqueCandles = [];


    for (
        const candle of chartCandles
    ) {

        const previous =
            uniqueCandles[
                uniqueCandles.length - 1
            ];


        if (
            previous &&
            previous.time ===
                candle.time
        ) {

            uniqueCandles[
                uniqueCandles.length - 1
            ] = candle;

        } else {

            uniqueCandles.push(
                candle
            );

        }

    }


    if (
        !uniqueCandles.length
    ) {

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


    const candlesWithChartTime =
        candles
            .map(
                c => ({
                    ...c,

                    chartTime:
                        c.chartTime ||
                        convertCandleTime(
                            c.datetime
                        )

                })
            )
            .filter(
                c =>
                    c.chartTime &&
                    finite(c.close)
            )
            .sort(
                (a,b) =>
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


    updateLivePriceLine();


    ChartState.chart
        .timeScale()
        .fitContent();


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
        const [key,value]
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

    const data =
        await twelveDataFetch(
            "/price",
            {
                symbol: PAIR
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
    interval,
    outputsize = 250
) {

    const data =
        await twelveDataFetch(
            "/time_series",
            {

                symbol:
                    PAIR,

                interval:
                    interval,

                outputsize:
                    outputsize,

                format:
                    "JSON"

            }
        );


    if (
        !data.values ||
        !Array.isArray(
            data.values
        )
    ) {

        throw new Error(
            `No candle data for ${interval}`
        );

    }


    const candles =
        data.values
            .map(
                item => {

                    const chartTime =
                        convertCandleTime(
                            item.datetime
                        );


                    return {

                        datetime:
                            item.datetime,

                        chartTime,

                        open:
                            Number(
                                item.open
                            ),

                        high:
                            Number(
                                item.high
                            ),

                        low:
                            Number(
                                item.low
                            ),

                        close:
                            Number(
                                item.close
                            ),

                        volume:
                            finite(
                                item.volume
                            )
                                ? Number(
                                    item.volume
                                )
                                : null

                    };

                }
            )
            .filter(
                c =>
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
   LOAD DAILY DATA
   ========================================================= */

async function loadDailyData() {

    try {

        const daily =
            await fetchCandles(
                "1day",
                30
            );


        if (
            daily.length >= 2
        ) {

            MarketState.candles.D1 =
                daily;


            MarketState.dailySR =
                calculateDailySupportResistance(
                    daily,
                    MarketState.livePrice
                );


            updateSRDisplay();

        }


        return true;

    } catch (error) {

        console.error(
            "Daily data error:",
            error
        );


        MarketState.candles.D1 =
            [];


        MarketState.dailySR =
            null;


        updateSRDisplay();


        return false;

    }

}


/* =========================================================
   LOAD MARKET DATA — ROBUST VERSION
   ========================================================= */

async function loadMarketData() {

    setText(
        "chartState",
        "DATA: LOADING..."
    );


    /* =====================================================
       1. LIVE PRICE
       ===================================================== */

    try {

        await fetchLivePrice();

    } catch (error) {

        console.error(
            "Live price error:",
            error
        );

        MarketState.connected =
            false;

        setText(
            "chartState",
            "PRICE: ERROR"
        );

        setText(
            "chartMessageText",
            "Live EUR/USD price unavailable"
        );

        setText(
            "decision",
            "WAIT"
        );

        setText(
            "decisionReason",
            "Live price unavailable"
        );

        return;

    }


    /* =====================================================
       2. M5 — PRIORITY
       ===================================================== */

    try {

        const m5 =
            await fetchCandles(
                "5min",
                250
            );


        MarketState.candles.M5 =
            m5;


        MarketState.connected =
            true;


        updateM5Status();

    } catch (error) {

        console.error(
            "M5 data error:",
            error
        );


        MarketState.connected =
            false;


        MarketState.candles.M5 =
            [];


        setText(
            "candleStatus",
            "ERROR"
        );


        setText(
            "chartState",
            "M5: ERROR"
        );


        setText(
            "decision",
            "WAIT"
        );


        setText(
            "decisionReason",
            "M5 candle data unavailable"
        );


        return;

    }


    /* =====================================================
       3. HIGHER TIMEFRAMES
       ===================================================== */

    const results =
        await Promise.allSettled([

            fetchCandles(
                "4h",
                250
            ),

            fetchCandles(
                "1h",
                250
            ),

            fetchCandles(
                "15min",
                250
            )

        ]);


    if (
        results[0].status ===
        "fulfilled"
    ) {

        MarketState.candles.H4 =
            results[0].value;

    } else {

        MarketState.candles.H4 =
            [];

        console.error(
            "H4 data error:",
            results[0].reason
        );

    }


    if (
        results[1].status ===
        "fulfilled"
    ) {

        MarketState.candles.H1 =
            results[1].value;

    } else {

        MarketState.candles.H1 =
            [];

        console.error(
            "H1 data error:",
            results[1].reason
        );

    }


    if (
        results[2].status ===
        "fulfilled"
    ) {

        MarketState.candles.M15 =
            results[2].value;

    } else {

        MarketState.candles.M15 =
            [];

        console.error(
            "M15 data error:",
            results[2].reason
        );

    }


    /* =====================================================
       4. DAILY DATA
       ===================================================== */

    await loadDailyData();


    /* =====================================================
       5. DASHBOARD UPDATE
       ===================================================== */

    MarketState.lastUpdate =
        new Date();


    updatePriceDisplay();

    updateM5Status();

    updateDataStatus();

    updateSessionDisplay();

    updateTimeframeDisplays();

    updateSRDisplay();

    updateFinancialChart();


    /* =====================================================
       6. RUN ENGINE 3
       ===================================================== */

    runAllEngines();


    /* =====================================================
       7. FINAL STATUS
       ===================================================== */

    setText(
        "chartMessageText",
        "Real EUR/USD M5 data connected"
    );


    const h4Ready =
        MarketState.candles.H4.length > 0;

    const h1Ready =
        MarketState.candles.H1.length > 0;

    const m15Ready =
        MarketState.candles.M15.length > 0;

    const dailyReady =
        MarketState.candles.D1.length >= 2;


    if (
        h4Ready &&
        h1Ready &&
        m15Ready &&
        dailyReady
    ) {

        setText(
            "chartState",
            "DATA: LIVE • ALL TIMEFRAMES READY"
        );

    } else {

        setText(
            "chartState",
            "DATA: LIVE • SOME TF UNAVAILABLE"
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
        result.direction ===
        "BUY"
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
        result.direction ===
        "SELL"
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


    initializeChart();


    loadMarketData();


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


window.calculateDailySupportResistance =
    calculateDailySupportResistance;


window.calculateSupportResistance =
    calculateDailySupportResistance;


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
