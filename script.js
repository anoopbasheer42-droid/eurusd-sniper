/* =========================================================
   EUR/USD SNIPER DASHBOARD
   FULL ELITE SCRIPT
   =========================================================
   LIVE PRICE
   INDIA TIME
   MULTI-TIMEFRAME DATA
   H4 / H1 / M15 / M5
   EMA 20 / 50 / 200
   RSI
   MOMENTUM
   MARKET STRUCTURE
   DAILY SUPPORT / RESISTANCE
   STRUCTURAL SL
   REAL R:R
   NEWS BLOCKER
   ENGINE 1
   ENGINE 2
   ENGINE 3 - ELITE TRADE GATE
   A+ REVERSAL
   ========================================================= */


/* =========================================================
   CONFIGURATION
   ========================================================= */

const TWELVE_DATA_API_KEY = "YOUR_TWELVE_DATA_API_KEY";

const SYMBOL = "EUR/USD";

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

    MOMENTUM_LOOKBACK: 5,

    REQUIRED_SCORE: 8,

    NEWS_BLOCKER: true,

    DAILY_SR_BUFFER_PERCENT: 0.10
};


/* =========================================================
   GLOBAL DATA
   ========================================================= */

let livePrice = null;

let marketData = {

    h4: null,
    h1: null,
    m15: null,
    m5: null,
    daily: null

};

let indicators = {

    h4: null,
    h1: null,
    m15: null,
    m5: null

};

let dailySR = null;

let lastTradeLevels = null;

let chart = null;

let candleSeries = null;

let chartInitialized = false;


/* =========================================================
   BASIC DOM HELPERS
   ========================================================= */

function getElement(id) {

    return document.getElementById(id);

}


function setText(id, value) {

    const el = getElement(id);

    if (el) {

        el.textContent = value;

    }

}


function setHTML(id, value) {

    const el = getElement(id);

    if (el) {

        el.innerHTML = value;

    }

}


/* =========================================================
   INDIA TIME
   ========================================================= */

function updateIndiaClock() {

    const now = new Date();

    const indiaTime = now.toLocaleTimeString("en-IN", {

        timeZone: "Asia/Kolkata",

        hour: "2-digit",

        minute: "2-digit",

        second: "2-digit",

        hour12: false

    });

    setText("indiaTime", indiaTime);

    setText("india-time", indiaTime);

    setText("clock", indiaTime);

}


/* =========================================================
   SESSION
   ========================================================= */

function getTradingSession() {

    const now = new Date();

    const hour = Number(

        new Intl.DateTimeFormat("en-IN", {

            timeZone: "Asia/Kolkata",

            hour: "numeric",

            hour12: false

        }).format(now)

    );


    if (hour >= 13 && hour < 18) {

        return "LONDON";

    }

    if (hour >= 18 && hour < 22) {

        return "NEW YORK";

    }

    if (hour >= 22 || hour < 3) {

        return "NEW YORK / ASIA";

    }

    if (hour >= 3 && hour < 7) {

        return "ASIA";

    }

    return "LONDON";

}


function updateSession() {

    setText("session", getTradingSession());

}


/* =========================================================
   TWELVE DATA REQUEST
   ========================================================= */

async function twelveDataFetch(endpoint, params = {}) {

    const url = new URL(

        "https://api.twelvedata.com/" + endpoint

    );


    url.searchParams.set(

        "apikey",

        TWELVE_DATA_API_KEY

    );


    Object.keys(params).forEach(key => {

        url.searchParams.set(key, params[key]);

    });


    const response = await fetch(url.toString(), {

        cache: "no-store"

    });


    if (!response.ok) {

        throw new Error(

            "HTTP " + response.status

        );

    }


    const data = await response.json();


    if (

        data.status === "error" ||

        data.code ||

        data.message && !data.values

    ) {

        throw new Error(

            data.message || "Twelve Data error"

        );

    }


    return data;

}


/* =========================================================
   LIVE PRICE
   ========================================================= */

async function fetchLivePrice() {

    try {

        const data = await twelveDataFetch(

            "price",

            {

                symbol: SYMBOL,

                format: "JSON"

            }

        );


        const price = Number(data.price);


        if (!Number.isFinite(price)) {

            throw new Error("Invalid price");

        }


        livePrice = price;


        updateLivePriceDisplay();


        return price;

    }

    catch (error) {

        console.error(

            "Live price error:",

            error

        );


        setText(

            "price",

            "—"

        );


        setText(

            "livePrice",

            "—"

        );


        return null;

    }

}


/* =========================================================
   LIVE PRICE DISPLAY
   ========================================================= */

function updateLivePriceDisplay() {

    if (!Number.isFinite(livePrice)) {

        return;

    }


    const formatted = livePrice.toFixed(5);


    setText("price", formatted);

    setText("livePrice", formatted);

    setText("currentPrice", formatted);

    setText("chartPrice", formatted);

}


/* =========================================================
   CANDLE FETCH
   ========================================================= */

async function fetchCandles(

    interval,

    outputsize = 250

) {

    const data = await twelveDataFetch(

        "time_series",

        {

            symbol: SYMBOL,

            interval: interval,

            outputsize: outputsize,

            format: "JSON",

            order: "ASC"

        }

    );


    if (!data.values || !Array.isArray(data.values)) {

        throw new Error(

            "No candle data for " + interval

        );

    }


    return data.values.map(candle => ({

        datetime: candle.datetime,

        open: Number(candle.open),

        high: Number(candle.high),

        low: Number(candle.low),

        close: Number(candle.close),

        volume: Number(candle.volume || 0)

    })).filter(candle =>

        Number.isFinite(candle.open) &&

        Number.isFinite(candle.high) &&

        Number.isFinite(candle.low) &&

        Number.isFinite(candle.close)

    );

}


/* =========================================================
   EMA
   ========================================================= */

function calculateEMA(values, period) {

    if (!values || values.length < period) {

        return null;

    }


    const multiplier = 2 / (period + 1);


    let ema = 0;


    for (let i = 0; i < period; i++) {

        ema += values[i];

    }


    ema /= period;


    for (let i = period; i < values.length; i++) {

        ema =

            (values[i] - ema) *

            multiplier +

            ema;

    }


    return ema;

}


/* =========================================================
   RSI
   ========================================================= */

function calculateRSI(values, period = 14) {

    if (!values || values.length <= period) {

        return null;

    }


    let gains = 0;

    let losses = 0;


    for (let i = 1; i <= period; i++) {

        const change = values[i] - values[i - 1];


        if (change >= 0) {

            gains += change;

        }

        else {

            losses += Math.abs(change);

        }

    }


    let averageGain = gains / period;

    let averageLoss = losses / period;


    for (let i = period + 1; i < values.length; i++) {

        const change = values[i] - values[i - 1];


        const gain = Math.max(change, 0);

        const loss = Math.max(-change, 0);


        averageGain =

            ((averageGain * (period - 1)) + gain) /

            period;


        averageLoss =

            ((averageLoss * (period - 1)) + loss) /

            period;

    }


    if (averageLoss === 0) {

        return 100;

    }


    const rs = averageGain / averageLoss;


    return 100 - (100 / (1 + rs));

}


/* =========================================================
   ATR
   ========================================================= */

function calculateATR(candles, period = 14) {

    if (!candles || candles.length <= period) {

        return null;

    }


    const trs = [];


    for (let i = 1; i < candles.length; i++) {

        const current = candles[i];

        const previous = candles[i - 1];


        const tr = Math.max(

            current.high - current.low,

            Math.abs(

                current.high - previous.close

            ),

            Math.abs(

                current.low - previous.close

            )

        );


        trs.push(tr);

    }


    if (trs.length < period) {

        return null;

    }


    let atr = 0;


    for (let i = 0; i < period; i++) {

        atr += trs[i];

    }


    atr /= period;


    for (let i = period; i < trs.length; i++) {

        atr =

            ((atr * (period - 1)) + trs[i]) /

            period;

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

    if (!candles || candles.length <= lookback) {

        return null;

    }


    const last = candles[candles.length - 1];

    const previous =

        candles[candles.length - 1 - lookback];


    return last.close - previous.close;

}


/* =========================================================
   TIMEFRAME INDICATORS
   ========================================================= */

function calculateIndicators(candles) {

    if (!candles || candles.length < 50) {

        return null;

    }


    const closes = candles.map(

        candle => candle.close

    );


    const ema20 = calculateEMA(

        closes,

        20

    );


    const ema50 = calculateEMA(

        closes,

        50

    );


    const ema200 = calculateEMA(

        closes,

        200

    );


    const rsi = calculateRSI(

        closes,

        14

    );


    const atr = calculateATR(

        candles,

        14

    );


    const momentum = calculateMomentum(

        candles,

        Engine3Config.MOMENTUM_LOOKBACK

    );


    const price = closes[closes.length - 1];


    return {

        price,

        ema20,

        ema50,

        ema200,

        rsi,

        atr,

        momentum

    };

}


/* =========================================================
   TIMEFRAME DIRECTION
   ========================================================= */

function getTimeframeDirection(indicator) {

    if (!indicator || !Number.isFinite(indicator.price)) {

        return "WAITING";

    }


    if (

        Number.isFinite(indicator.ema20) &&

        indicator.price > indicator.ema20

    ) {

        return "BULLISH";

    }


    if (

        Number.isFinite(indicator.ema20) &&

        indicator.price < indicator.ema20

    ) {

        return "BEARISH";

    }


    return "NEUTRAL";

}


/* =========================================================
   SWING DETECTION
   ========================================================= */

function findSwingHighs(

    candles,

    lookback = 2

) {

    const swings = [];


    for (

        let i = lookback;

        i < candles.length - lookback;

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

            swings.push({

                index: i,

                price: candles[i].high

            });

        }

    }


    return swings;

}


function findSwingLows(

    candles,

    lookback = 2

) {

    const swings = [];


    for (

        let i = lookback;

        i < candles.length - lookback;

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

            swings.push({

                index: i,

                price: candles[i].low

            });

        }

    }


    return swings;

}


/* =========================================================
   MARKET STRUCTURE
   ========================================================= */

function evaluateStructure(candles) {

    if (!candles || candles.length < 20) {

        return {

            direction: "WAITING",

            status: "STRUCTURE DATA UNAVAILABLE",

            swingHigh: null,

            swingLow: null

        };

    }


    const highs = findSwingHighs(

        candles,

        Engine3Config.SWING_LOOKBACK

    );


    const lows = findSwingLows(

        candles,

        Engine3Config.SWING_LOOKBACK

    );


    if (highs.length < 2 || lows.length < 2) {

        return {

            direction: "WAITING",

            status: "WAITING FOR SWINGS",

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


    const h1 = highs[highs.length - 2];

    const h2 = highs[highs.length - 1];

    const l1 = lows[lows.length - 2];

    const l2 = lows[lows.length - 1];


    const bullish =

        h2.price > h1.price &&

        l2.price > l1.price;


    const bearish =

        h2.price < h1.price &&

        l2.price < l1.price;


    let direction = "MIXED";

    let status = "MIXED STRUCTURE";


    if (bullish) {

        direction = "BULLISH";

        status = "BULLISH STRUCTURE";

    }


    if (bearish) {

        direction = "BEARISH";

        status = "BEARISH STRUCTURE";

    }


    return {

        direction,

        status,

        swingHigh: h2.price,

        swingLow: l2.price

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

        rsi === null ||

        !Number.isFinite(rsi)

    ) {

        return {

            valid: false,

            status: "RSI DATA UNAVAILABLE",

            reason: "RSI data unavailable"

        };

    }


    if (direction === "BUY") {

        if (

            rsi >=

            Engine3Config.RSI_OVERBOUGHT

        ) {

            return {

                valid: false,

                status: "BUY BLOCKED - RSI OVERBOUGHT",

                reason: "RSI >= 70"

            };

        }


        if (

            rsi <

                Engine3Config.RSI_BUY_MIN ||

            rsi >

                Engine3Config.RSI_BUY_MAX

        ) {

            return {

                valid: true,

                status: "BUY RSI CAUTION",

                reason: "RSI outside preferred BUY zone"

            };

        }


        return {

            valid: true,

            status: "RSI IN TRADE ZONE",

            reason: "BUY RSI safe"

        };

    }


    if (direction === "SELL") {

        if (

            rsi <=

            Engine3Config.RSI_OVERSOLD

        ) {

            return {

                valid: false,

                status: "SELL BLOCKED - RSI OVERSOLD",

                reason: "RSI <= 30"

            };

        }


        if (

            rsi <

                Engine3Config.RSI_SELL_MIN ||

            rsi >

                Engine3Config.RSI_SELL_MAX

        ) {

            return {

                valid: true,

                status: "SELL RSI CAUTION",

                reason: "RSI outside preferred SELL zone"

            };

        }


        return {

            valid: true,

            status: "RSI IN TRADE ZONE",

            reason: "SELL RSI safe"

        };

    }


    return {

        valid: false,

        status: "RSI WAITING",

        reason: "Direction unavailable"

    };

}


/* =========================================================
   RSI OVERBOUGHT / OVERSOLD PROTECTION
   ========================================================= */

function evaluateRSIProtection(

    rsi,

    direction

) {

    if (!Number.isFinite(rsi)) {

        return {

            valid: false,

            status: "PROTECTION UNKNOWN"

        };

    }


    if (

        direction === "BUY" &&

        rsi >= Engine3Config.RSI_OVERBOUGHT

    ) {

        return {

            valid: false,

            status: "BUY BLOCKED - OVERBOUGHT"

        };

    }


    if (

        direction === "SELL" &&

        rsi <= Engine3Config.RSI_OVERSOLD

    ) {

        return {

            valid: false,

            status: "SELL BLOCKED - OVERSOLD"

        };

    }


    return {

        valid: true,

        status: "PROTECTION PASSED"

    };

}


/* =========================================================
   EMA ALIGNMENT
   ========================================================= */

function evaluateEMAAlignment(

    indicator,

    direction

) {

    if (

        !indicator ||

        !Number.isFinite(indicator.ema20) ||

        !Number.isFinite(indicator.ema50) ||

        !Number.isFinite(indicator.ema200)

    ) {

        return {

            valid: false,

            status: "EMA DATA UNAVAILABLE"

        };

    }


    if (direction === "BUY") {

        const valid =

            indicator.ema20 >

            indicator.ema50 &&

            indicator.ema50 >

            indicator.ema200;


        return {

            valid,

            status: valid

                ? "EMA ALIGNED"

                : "EMA MISALIGNED"

        };

    }


    if (direction === "SELL") {

        const valid =

            indicator.ema20 <

            indicator.ema50 &&

            indicator.ema50 <

            indicator.ema200;


        return {

            valid,

            status: valid

                ? "EMA ALIGNED"

                : "EMA MISALIGNED"

        };

    }


    return {

        valid: false,

        status: "EMA WAITING"

    };

}


/* =========================================================
   MOMENTUM
   ========================================================= */

function evaluateMomentum(

    momentum,

    direction

) {

    if (!Number.isFinite(momentum)) {

        return {

            valid: false,

            status: "MOMENTUM UNAVAILABLE"

        };

    }


    if (direction === "BUY") {

        return {

            valid: momentum > 0,

            status:

                momentum > 0

                    ? "MOMENTUM CONFIRMED"

                    : "MOMENTUM AGAINST BUY"

        };

    }


    if (direction === "SELL") {

        return {

            valid: momentum < 0,

            status:

                momentum < 0

                    ? "MOMENTUM CONFIRMED"

                    : "MOMENTUM AGAINST SELL"

        };

    }


    return {

        valid: false,

        status: "MOMENTUM WAITING"

    };

}


/* =========================================================
   CANDLE QUALITY
   ========================================================= */

function evaluateCandleQuality(candles) {

    if (!candles || candles.length < 2) {

        return {

            valid: false,

            status: "CANDLE DATA UNAVAILABLE"

        };

    }


    const candle = candles[candles.length - 1];


    const range =

        candle.high - candle.low;


    if (range <= 0) {

        return {

            valid: false,

            status: "INVALID CANDLE"

        };

    }


    const body =

        Math.abs(

            candle.close -

            candle.open

        );


    const bodyRatio = body / range;


    return {

        valid: bodyRatio >= 0.45,

        status:

            bodyRatio >= 0.45

                ? "STRONG CANDLE"

                : "WEAK CANDLE"

    };

}


/* =========================================================
   EMA EXTENSION
   ========================================================= */

function evaluateEMAExtension(

    price,

    ema20,

    atr

) {

    if (

        !Number.isFinite(price) ||

        !Number.isFinite(ema20) ||

        !Number.isFinite(atr) ||

        atr <= 0

    ) {

        return {

            valid: false,

            status: "EMA EXTENSION UNKNOWN"

        };

    }


    const distance =

        Math.abs(price - ema20);


    const maximum =

        atr *

        Engine3Config.EMA_EXTENSION_ATR;


    return {

        valid: distance <= maximum,

        status:

            distance <= maximum

                ? "EMA EXTENSION SAFE"

                : "EMA OVEREXTENDED",

        distance,

        maximum

    };

}


/* =========================================================
   DAILY SUPPORT / RESISTANCE
   ========================================================= */

function calculateDailySupportResistance(

    candles

) {

    if (!candles || candles.length < 2) {

        return {

            valid: false

        };

    }


    const previous =

        candles[candles.length - 2];


    const pdh = previous.high;

    const pdl = previous.low;

    const pdc = previous.close;


    const pivot =

        (pdh + pdl + pdc) / 3;


    const r1 =

        2 * pivot - pdl;


    const r2 =

        pivot + (pdh - pdl);


    const r3 =

        pdh + 2 * (pivot - pdl);


    const s1 =

        2 * pivot - pdh;


    const s2 =

        pivot - (pdh - pdl);


    const s3 =

        pdl - 2 * (pdh - pivot);


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

        s3

    };

}


/* =========================================================
   DAILY S/R LOCATION
   ========================================================= */

function evaluateDailySR(

    price,

    direction,

    sr

) {

    if (

        !sr ||

        !sr.valid ||

        !Number.isFinite(price)

    ) {

        return {

            valid: false,

            status: "DAILY S/R UNAVAILABLE"

        };

    }


    const resistanceLevels = [

        sr.r1,

        sr.r2,

        sr.r3,

        sr.pdh

    ]

        .filter(Number.isFinite)

        .filter(level => level > price)

        .sort((a, b) => a - b);


    const supportLevels = [

        sr.s1,

        sr.s2,

        sr.s3,

        sr.pdl

    ]

        .filter(Number.isFinite)

        .filter(level => level < price)

        .sort((a, b) => b - a);


    if (direction === "BUY") {

        const nearest = resistanceLevels[0];


        if (!Number.isFinite(nearest)) {

            return {

                valid: true,

                status: "NO NEAR DAILY RESISTANCE",

                nearestResistance: null

            };

        }


        const range = sr.pdh - sr.pdl;


        const room =

            nearest - price;


        const buffer =

            range *

            Engine3Config.DAILY_SR_BUFFER_PERCENT;


        if (room <= buffer) {

            return {

                valid: false,

                status: "NEAR OPPOSING ZONE",

                nearestResistance: nearest,

                nextResistance:

                    resistanceLevels[1] || null

            };

        }


        return {

            valid: true,

            status: "DAILY S/R VALID",

            nearestResistance: nearest,

            nextResistance:

                resistanceLevels[1] || null

        };

    }


    if (direction === "SELL") {

        const nearest = supportLevels[0];


        if (!Number.isFinite(nearest)) {

            return {

                valid: true,

                status: "NO NEAR DAILY SUPPORT",

                nearestSupport: null

            };

        }


        const range = sr.pdh - sr.pdl;


        const room =

            price - nearest;


        const buffer =

            range *

            Engine3Config.DAILY_SR_BUFFER_PERCENT;


        if (room <= buffer) {

            return {

                valid: false,

                status: "NEAR OPPOSING ZONE",

                nearestSupport: nearest,

                nextSupport:

                    supportLevels[1] || null

            };

        }


        return {

            valid: true,

            status: "DAILY S/R VALID",

            nearestSupport: nearest,

            nextSupport:

                supportLevels[1] || null

        };

    }


    return {

        valid: false,

        status: "S/R WAITING"

    };

}


/* =========================================================
   DAILY S/R DISPLAY
   ========================================================= */

function updateSRDisplay(sr) {

    if (!sr || !sr.valid) {

        setText("resistance1", "—");

        setText("resistance2", "—");

        setText("support1", "—");

        setText("support2", "—");

        return;

    }


    const resistance = [

        sr.r1,

        sr.r2,

        sr.r3,

        sr.pdh

    ]

        .filter(Number.isFinite)

        .filter(x => x > livePrice)

        .sort((a, b) => a - b);


    const support = [

        sr.s1,

        sr.s2,

        sr.s3,

        sr.pdl

    ]

        .filter(Number.isFinite)

        .filter(x => x < livePrice)

        .sort((a, b) => b - a);


    setText(

        "resistance1",

        resistance[0]

            ? resistance[0].toFixed(5)

            : "—"

    );


    setText(

        "resistance2",

        resistance[1]

            ? resistance[1].toFixed(5)

            : "—"

    );


    setText(

        "support1",

        support[0]

            ? support[0].toFixed(5)

            : "—"

    );


    setText(

        "support2",

        support[1]

            ? support[1].toFixed(5)

            : "—"

    );

}


/* =========================================================
   STRUCTURAL SL
   ========================================================= */

function calculateStructuralSL(

    candles,

    direction,

    entry

) {

    const structure =

        evaluateStructure(candles);


    if (direction === "BUY") {

        if (

            Number.isFinite(

                structure.swingLow

            ) &&

            structure.swingLow < entry

        ) {

            return structure.swingLow;

        }

    }


    if (direction === "SELL") {

        if (

            Number.isFinite(

                structure.swingHigh

            ) &&

            structure.swingHigh > entry

        ) {

            return structure.swingHigh;

        }

    }


    const atr =

        calculateATR(candles, 14);


    if (Number.isFinite(atr)) {

        if (direction === "BUY") {

            return entry - atr * 1.5;

        }


        if (direction === "SELL") {

            return entry + atr * 1.5;

        }

    }


    return null;

}


/* =========================================================
   REAL TRADE LEVELS
   ========================================================= */

function calculateTradeLevels(

    entry,

    sl,

    direction,

    sr

) {

    if (

        !Number.isFinite(entry) ||

        !Number.isFinite(sl)

    ) {

        return {

            valid: false

        };

    }


    const risk =

        Math.abs(entry - sl);


    if (risk <= 0) {

        return {

            valid: false

        };

    }


    let tp1 = null;

    let tp2 = null;


    if (direction === "BUY") {

        const levels = [

            sr?.r1,

            sr?.r2,

            sr?.r3,

            sr?.pdh

        ]

            .filter(Number.isFinite)

            .filter(level => level > entry)

            .sort((a, b) => a - b);


        tp1 = levels[0] || entry + risk * 2;

        tp2 = levels[1] || entry + risk * 3;

    }


    if (direction === "SELL") {

        const levels = [

            sr?.s1,

            sr?.s2,

            sr?.s3,

            sr?.pdl

        ]

            .filter(Number.isFinite)

            .filter(level => level < entry)

            .sort((a, b) => b - a);


        tp1 = levels[0] || entry - risk * 2;

        tp2 = levels[1] || entry - risk * 3;

    }


    const reward =

        Math.abs(tp1 - entry);


    const rr =

        reward / risk;


    return {

        valid:

            Number.isFinite(rr) &&

            rr >= Engine3Config.MIN_RR,

        entry,

        sl,

        tp1,

        tp2,

        risk,

        reward,

        rr

    };

}


/* =========================================================
   A+ REVERSAL
   ========================================================= */

function evaluateAPlusReversal(

    candles,

    rsi,

    direction

) {

    if (

        !candles ||

        candles.length < 3 ||

        !Number.isFinite(rsi)

    ) {

        return {

            valid: false,

            status: "NO A+ REVERSAL"

        };

    }


    const current =

        candles[candles.length - 1];


    const previous =

        candles[candles.length - 2];


    const range =

        current.high -

        current.low;


    if (range <= 0) {

        return {

            valid: false,

            status: "NO A+ REVERSAL"

        };

    }


    const closePosition =

        (current.close - current.low) /

        range;


    if (direction === "BUY") {

        const bullish =

            current.close >

            current.open;


        const sweptLow =

            current.low <

            previous.low;


        const upperClose =

            closePosition >= 0.60;


        const rsiCondition =

            rsi < 45;


        if (

            bullish &&

            sweptLow &&

            upperClose &&

            rsiCondition

        ) {

            return {

                valid: true,

                status: "A+ BUY REVERSAL"

            };

        }

    }


    if (direction === "SELL") {

        const bearish =

            current.close <

            current.open;


        const sweptHigh =

            current.high >

            previous.high;


        const lowerClose =

            closePosition <= 0.40;


        const rsiCondition =

            rsi > 55;


        if (

            bearish &&

            sweptHigh &&

            lowerClose &&

            rsiCondition

        ) {

            return {

                valid: true,

                status: "A+ SELL REVERSAL"

            };

        }

    }


    return {

        valid: false,

        status: "NO A+ REVERSAL"

    };

}


/* =========================================================
   NEWS BLOCKER
   ========================================================= */

function evaluateNewsBlocker() {

    return {

        valid: false,

        known: false,

        status: "NEWS NOT CONFIRMED",

        reason: "Economic calendar not connected"

    };

}


/* =========================================================
   ENGINE 3
   ========================================================= */

function evaluateTradeGate() {

    const h4 = indicators.h4;

    const h1 = indicators.h1;

    const m15 = indicators.m15;

    const m5 = indicators.m5;


    if (

        !h4 ||

        !h1 ||

        !m15 ||

        !m5 ||

        !Number.isFinite(livePrice)

    ) {

        return {

            decision: "WAIT",

            reason: "MARKET DATA INCOMPLETE",

            score: 0,

            maxScore: 11

        };

    }


    const h4Direction =

        getTimeframeDirection(h4);


    const h1Direction =

        getTimeframeDirection(h1);


    let direction = null;


    if (

        h4Direction === "BULLISH" &&

        h1Direction === "BULLISH"

    ) {

        direction = "BUY";

    }


    if (

        h4Direction === "BEARISH" &&

        h1Direction === "BEARISH"

    ) {

        direction = "SELL";

    }


    if (!direction) {

        updateEngine3Display({

            decision: "WAIT",

            reason: "H4 + H1 DIRECTION NOT ALIGNED",

            score: 0,

            maxScore: 11

        });


        return {

            decision: "WAIT",

            reason: "H4 + H1 direction not aligned",

            score: 0,

            maxScore: 11

        };

    }


    const m15Structure =

        evaluateStructure(marketData.m15);


    const m5Structure =

        evaluateStructure(marketData.m5);


    const structureConfirmed =

        m15Structure.direction === direction &&

        m5Structure.direction === direction;


    const emaCheck =

        evaluateEMAAlignment(

            m5,

            direction

        );


    const rsiCheck =

        getEliteRSIProtection(

            m5.rsi,

            direction

        );


    const rsiProtection =

        evaluateRSIProtection(

            m5.rsi,

            direction

        );


    const momentumCheck =

        evaluateMomentum(

            m5.momentum,

            direction

        );


    const candleCheck =

        evaluateCandleQuality(

            marketData.m5

        );


    const extensionCheck =

        evaluateEMAExtension(

            livePrice,

            m5.ema20,

            m5.atr

        );


    const dailyCheck =

        evaluateDailySR(

            livePrice,

            direction,

            dailySR

        );


    const sl =

        calculateStructuralSL(

            marketData.m5,

            direction,

            livePrice

        );


    const tradeLevels =

        calculateTradeLevels(

            livePrice,

            sl,

            direction,

            dailySR

        );


    const newsCheck =

        evaluateNewsBlocker();


    const reversalCheck =

        evaluateAPlusReversal(

            marketData.m5,

            m5.rsi,

            direction

        );


    let score = 0;


    if (

        h4Direction === direction &&

        h1Direction === direction

    ) {

        score++;

    }


    if (structureConfirmed) {

        score++;

    }


    if (emaCheck.valid) {

        score++;

    }


    if (rsiCheck.valid) {

        score++;

    }


    if (momentumCheck.valid) {

        score++;

    }


    if (candleCheck.valid) {

        score++;

    }


    if (extensionCheck.valid) {

        score++;

    }


    if (

        getTradingSession() !== "ASIA"

    ) {

        score++;

    }


    if (dailyCheck.valid) {

        score++;

    }


    if (tradeLevels.valid) {

        score++;

    }


    if (reversalCheck.valid) {

        score++;

    }


    const hardBlock =

        !rsiProtection.valid ||

        !extensionCheck.valid ||

        !newsCheck.known ||

        !dailyCheck.valid ||

        !tradeLevels.valid;


    let decision = "WAIT";

    let reason = "A+ SETUP NOT CONFIRMED";


    if (hardBlock) {

        decision = "BLOCKED";

        reason =

            !newsCheck.known

                ? "NEWS NOT CONFIRMED"

                : !dailyCheck.valid

                    ? "DAILY S/R BLOCK"

                    : !tradeLevels.valid

                        ? "REAL R:R BELOW 1:2"

                        : !rsiProtection.valid

                            ? "RSI PROTECTION BLOCK"

                            : "EMA EXTENSION BLOCK";

    }

    else if (

        score >=

        Engine3Config.REQUIRED_SCORE

    ) {

        decision = "WAIT";

        reason =

            direction +

            " A+ CONDITIONS PRESENT - NEWS CONFIRMATION REQUIRED";

    }


    const result = {

        decision,

        reason,

        direction,

        score,

        maxScore: 11,

        h4Direction,

        h1Direction,

        structureConfirmed,

        emaCheck,

        rsiCheck,

        rsiProtection,

        momentumCheck,

        candleCheck,

        extensionCheck,

        dailyCheck,

        tradeLevels,

        newsCheck,

        reversalCheck,

        sl

    };


    updateEngine3Display(result);


    return result;

}


/* =========================================================
   ENGINE 3 DISPLAY
   ========================================================= */

function updateEngine3Display(result) {

    if (!result) {

        return;

    }


    setText(

        "engine3Decision",

        result.decision || "WAIT"

    );


    setText(

        "engine3Reason",

        result.reason || "A+ setup not confirmed"

    );


    setText(

        "score",

        `${result.score || 0} / ${result.maxScore || 11}`

    );


    setText(

        "dynamicScore",

        `${result.score || 0} / ${result.maxScore || 11}`

    );


    setText(

        "h4h1Agreement",

        result.h4Direction &&

        result.h1Direction &&

        result.h4Direction ===

        result.h1Direction

            ? "ALIGNED"

            : "NOT ALIGNED"

    );


    setText(

        "structureCheck",

        result.structureConfirmed

            ? "CONFIRMED"

            : "NOT CONFIRMED"

    );


    setText(

        "emaCheck",

        result.emaCheck

            ? result.emaCheck.status

            : "WAITING"

    );


    setText(

        "rsiSafety",

        result.rsiCheck

            ? result.rsiCheck.status

            : "WAITING"

    );


    setText(

        "rsiProtection",

        result.rsiProtection

            ? result.rsiProtection.status

            : "WAITING"

    );


    setText(

        "momentumCheck",

        result.momentumCheck

            ? result.momentumCheck.status

            : "WAITING"

    );


    setText(

        "candleQuality",

        result.candleCheck

            ? result.candleCheck.status

            : "WAITING"

    );


    setText(

        "emaExtension",

        result.extensionCheck

            ? result.extensionCheck.status

            : "WAITING"

    );


    setText(

        "sessionContext",

        getTradingSession()

    );


    setText(

        "srValidation",

        result.dailyCheck

            ? result.dailyCheck.status

            : "WAITING"

    );


    setText(

        "newsBlocker",

        result.newsCheck

            ? result.newsCheck.status

            : "NEWS NOT CONFIRMED"

    );


    setText(

        "structuralSL",

        Number.isFinite(result.sl)

            ? result.sl.toFixed(5)

            : "—"

    );


    setText(

        "realRR",

        result.tradeLevels &&

        Number.isFinite(result.tradeLevels.rr)

            ? result.tradeLevels.rr.toFixed(2)

            : "—"

    );


    setText(

        "aplusReversal",

        result.reversalCheck

            ? result.reversalCheck.status

            : "NO A+ REVERSAL"

    );


    if (

        result.tradeLevels

    ) {

        setText(

            "entryPrice",

            result.tradeLevels.entry

                .toFixed(5)

        );


        setText(

            "riskSL",

            result.tradeLevels.sl

                .toFixed(5)

        );


        setText(

            "tp1",

            result.tradeLevels.tp1

                .toFixed(5)

        );


        setText(

            "tp2",

            result.tradeLevels.tp2

                .toFixed(5)

        );


        setText(

            "actualRR",

            "1:" +

            result.tradeLevels.rr

                .toFixed(2)

        );

    }

}


/* =========================================================
   TIMEFRAME DISPLAY
   ========================================================= */

function updateTimeframeDisplay(

    timeframe,

    candles,

    indicator

) {

    if (!candles || !indicator) {

        return;

    }


    const structure =

        evaluateStructure(candles);


    const direction =

        getTimeframeDirection(indicator);


    const prefix =

        timeframe.toLowerCase();


    setText(

        prefix + "Direction",

        direction

    );


    setText(

        prefix + "Structure",

        structure.status

    );


    setText(

        prefix + "RSI",

        Number.isFinite(indicator.rsi)

            ? indicator.rsi.toFixed(2)

            : "—"

    );


    setText(

        prefix + "EMA",

        Number.isFinite(indicator.ema20) &&

        Number.isFinite(indicator.ema50)

            ? indicator.ema20 >

              indicator.ema50

                ? "BULLISH"

                : "BEARISH"

            : "—"

    );

}


/* =========================================================
   M5 DISPLAY
   ========================================================= */

function updateM5Display() {

    const m5 = indicators.m5;


    if (!m5) {

        setText(

            "m5Candle",

            "WAITING"

        );

        return;

    }


    setText(

        "m5Candle",

        marketData.m5

            ? `${marketData.m5.length} CANDLES`

            : "WAITING"

    );


    setText(

        "ema20",

        Number.isFinite(m5.ema20)

            ? m5.ema20.toFixed(5)

            : "—"

    );


    setText(

        "ema50",

        Number.isFinite(m5.ema50)

            ? m5.ema50.toFixed(5)

            : "—"

    );


    setText(

        "ema200",

        Number.isFinite(m5.ema200)

            ? m5.ema200.toFixed(5)

            : "—"

    );


    setText(

        "rsi",

        Number.isFinite(m5.rsi)

            ? m5.rsi.toFixed(2)

            : "—"

    );


    setText(

        "momentum",

        Number.isFinite(m5.momentum)

            ? m5.momentum.toFixed(5)

            : "—"

    );


    const candleQuality =

        evaluateCandleQuality(

            marketData.m5

        );


    setText(

        "candleQualityValue",

        candleQuality.status

    );


    const extension =

        evaluateEMAExtension(

            livePrice,

            m5.ema20,

            m5.atr

        );


    setText(

        "emaExtensionValue",

        extension.status

    );

}


/* =========================================================
   CHART
   ========================================================= */

function initializeChart() {

    try {

        if (

            typeof LightweightCharts ===

            "undefined"

        ) {

            console.warn(

                "Lightweight Charts library unavailable"

            );

            return;

        }


        const container =

            getElement("chart");


        if (!container) {

            return;

        }


        chart =

            LightweightCharts.createChart(

                container,

                {

                    layout: {

                        background: {

                            color: "transparent"

                        },

                        textColor: "#cbd5e1"

                    },

                    grid: {

                        vertLines: {

                            color: "#172033"

                        },

                        horzLines: {

                            color: "#172033"

                        }

                    },

                    width:

                        container.clientWidth,

                    height: 380,

                    timeScale: {

                        timeVisible: true

                    }

                }

            );


        candleSeries =

            chart.addCandlestickSeries();


        chartInitialized = true;

    }

    catch (error) {

        console.error(

            "Chart initialization error:",

            error

        );

    }

}


/* =========================================================
   UPDATE CHART
   ========================================================= */

function updateChart(candles) {

    if (

        !chartInitialized ||

        !candleSeries ||

        !candles

    ) {

        return;

    }


    const data = candles

        .map(candle => {

            const timestamp =

                Math.floor(

                    new Date(

                        candle.datetime

                    ).getTime() / 1000

                );


            return {

                time: timestamp,

                open: candle.open,

                high: candle.high,

                low: candle.low,

                close: candle.close

            };

        })

        .filter(candle =>

            Number.isFinite(candle.time)

        );


    try {

        candleSeries.setData(data);

        chart.timeScale().fitContent();

    }

    catch (error) {

        console.error(

            "Chart update error:",

            error

        );

    }

}


/* =========================================================
   LOAD DAILY DATA
   ========================================================= */

async function loadDailyData() {

    try {

        const candles =

            await fetchCandles(

                "1day",

                30

            );


        dailySR =

            calculateDailySupportResistance(

                candles

            );


        updateSRDisplay(

            dailySR

        );


        return dailySR;

    }

    catch (error) {

        console.error(

            "Daily data error:",

            error

        );


        dailySR = null;


        updateSRDisplay(null);


        return null;

    }

}


/* =========================================================
   LOAD MARKET DATA
   ========================================================= */

async function loadMarketData() {

    updateIndiaClock();

    updateSession();


    /* -----------------------------------------
       LIVE PRICE
       ----------------------------------------- */

    await fetchLivePrice();


    /* -----------------------------------------
       M5
       ----------------------------------------- */

    try {

        marketData.m5 =

            await fetchCandles(

                "5min",

                250

            );


        indicators.m5 =

            calculateIndicators(

                marketData.m5

            );


        updateM5Display();

        updateTimeframeDisplay(

            "M5",

            marketData.m5,

            indicators.m5

        );


        updateChart(

            marketData.m5

        );

    }

    catch (error) {

        console.error(

            "M5 error:",

            error

        );

        marketData.m5 = null;

        indicators.m5 = null;

        setText(

            "m5Candle",

            "WAITING"

        );

    }


    /* -----------------------------------------
       H4 / H1 / M15
       ----------------------------------------- */

    const timeframeResults =

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

        timeframeResults[0].status ===

        "fulfilled"

    ) {

        marketData.h4 =

            timeframeResults[0].value;

        indicators.h4 =

            calculateIndicators(

                marketData.h4

            );

        updateTimeframeDisplay(

            "H4",

            marketData.h4,

            indicators.h4

        );

    }


    if (

        timeframeResults[1].status ===

        "fulfilled"

    ) {

        marketData.h1 =

            timeframeResults[1].value;

        indicators.h1 =

            calculateIndicators(

                marketData.h1

            );

        updateTimeframeDisplay(

            "H1",

            marketData.h1,

            indicators.h1

        );

    }


    if (

        timeframeResults[2].status ===

        "fulfilled"

    ) {

        marketData.m15 =

            timeframeResults[2].value;

        indicators.m15 =

            calculateIndicators(

                marketData.m15

            );

        updateTimeframeDisplay(

            "M15",

            marketData.m15,

            indicators.m15

        );

    }


    /* -----------------------------------------
       DAILY
       ----------------------------------------- */

    await loadDailyData();


    /* -----------------------------------------
       ENGINE 3
       ----------------------------------------- */

    evaluateTradeGate();

}


/* =========================================================
   REFRESH BUTTON
   ========================================================= */

function setupRefreshButton() {

    const possibleIds = [

        "refresh",

        "refreshBtn",

        "refreshDashboard",

        "refreshData"

    ];


    possibleIds.forEach(id => {

        const button =

            getElement(id);


        if (button) {

            button.addEventListener(

                "click",

                async () => {

                    await loadMarketData();

                }

            );

        }

    });

}


/* =========================================================
   RESIZE CHART
   ========================================================= */

window.addEventListener(

    "resize",

    () => {

        if (

            chart &&

            getElement("chart")

        ) {

            chart.applyOptions({

                width:

                    getElement("chart")

                        .clientWidth

            });

        }

    }

);


/* =========================================================
   CLOCK LOOP
   ========================================================= */

function startClock() {

    updateIndiaClock();

    updateSession();


    setInterval(

        () => {

            updateIndiaClock();

            updateSession();

        },

        1000

    );

}


/* =========================================================
   MARKET REFRESH LOOP
   ========================================================= */

function startMarketRefresh() {

    setInterval(

        () => {

            loadMarketData();

        },

        30000

    );

}


/* =========================================================
   START DASHBOARD
   ========================================================= */

document.addEventListener(

    "DOMContentLoaded",

    async () => {

        console.log(

            "EUR/USD Sniper Dashboard starting..."

        );


        /* IMPORTANT:
           Clock starts independently.
           Even if Twelve Data fails,
           India Time continues working.
        */

        startClock();


        /* Chart */

        initializeChart();


        /* Refresh button */

        setupRefreshButton();


        /* Initial market load */

        await loadMarketData();


        /* Automatic refresh */

        startMarketRefresh();


        console.log(

            "EUR/USD Sniper Dashboard ready."

        );

    }

);


/* =========================================================
   SAFETY START
   ========================================================= */

if (

    document.readyState ===

    "interactive" ||

    document.readyState ===

    "complete"

) {

    startClock();

    initializeChart();

    setupRefreshButton();

}


/* =========================================================
   END
   ========================================================= */
