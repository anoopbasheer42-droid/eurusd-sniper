/* =========================================================
   EUR/USD SNIPER DASHBOARD
   FULL ENGINE VERSION

   ENGINE 1 = A+ SNIPER
   ENGINE 2 = SCALP
   ENGINE 3 = ELITE TRADE GATE

   S/R = H1 HOURLY SWING SUPPORT & RESISTANCE
   ========================================================= */


/* =========================================================
   CONFIGURATION
   ========================================================= */

const TWELVE_DATA_API_KEY = "53821bf38bec40e4a88bd1fa06ac32b3";

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

    H1_SR_LOOKBACK: 100

};


/* =========================================================
   GLOBAL DATA
   ========================================================= */

let livePrice = null;

let candles = {

    H4: [],
    H1: [],
    M15: [],
    M5: [],
    D1: []

};

let indicators = {

    H4: {},
    H1: {},
    M15: {},
    M5: {}

};

let hourlySR = null;

let chart = null;

let candleSeries = null;

let refreshInterval = null;

let clockInterval = null;


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function setText(id, value) {

    const el = document.getElementById(id);

    if (el) {

        el.textContent = value;

    }

}


function getElement(id) {

    return document.getElementById(id);

}


function finite(value) {

    return Number.isFinite(Number(value));

}


function num(value) {

    const n = Number(value);

    return Number.isFinite(n) ? n : null;

}


function formatPrice(value) {

    if (!finite(value)) {

        return "—";

    }

    return Number(value).toFixed(5);

}


/* =========================================================
   INDIA CLOCK
   ========================================================= */

function updateIndiaClock() {

    const now = new Date();

    const indiaTime = now.toLocaleTimeString(

        "en-IN",

        {

            timeZone: "Asia/Kolkata",

            hour: "2-digit",

            minute: "2-digit",

            second: "2-digit",

            hour12: false

        }

    );

    setText("indiaTime", indiaTime);

    setText("india-time", indiaTime);

    setText("clock", indiaTime);

}


function startClock() {

    updateIndiaClock();

    if (clockInterval) {

        clearInterval(clockInterval);

    }

    clockInterval = setInterval(

        updateIndiaClock,

        1000

    );

}


/* =========================================================
   LIVE PRICE
   ========================================================= */

async function fetchLivePrice() {

    try {

        const url =

            "https://api.twelvedata.com/price" +

            "?symbol=" +

            encodeURIComponent(SYMBOL) +

            "&apikey=" +

            encodeURIComponent(

                TWELVE_DATA_API_KEY

            );


        const response =

            await fetch(url);


        const data =

            await response.json();


        if (

            !data ||

            data.status === "error" ||

            !finite(data.price)

        ) {

            throw new Error(

                data && data.message

                    ? data.message

                    : "Invalid price data"

            );

        }


        livePrice = Number(data.price);


        /*
           LIVE PRICE DISPLAY

           Update every possible price field,
           including the S/R Current Price field.
        */

        const formattedPrice =

            livePrice.toFixed(5);


        setText(

            "price",

            formattedPrice

        );


        setText(

            "livePrice",

            formattedPrice

        );


        setText(

            "currentPrice",

            formattedPrice

        );


        setText(

            "chartPrice",

            formattedPrice

        );


        setText(

            "srCurrentPrice",

            formattedPrice

        );


        setText(

            "trend",

            "Twelve Data connected • Updated: " +

            new Date().toLocaleTimeString("en-IN")

        );


        console.log(

            "LIVE EUR/USD PRICE:",

            formattedPrice

        );


        return livePrice;


    } catch (error) {

        console.error(

            "Live price error:",

            error

        );


        setText(

            "price",

            "Unavailable"

        );


        setText(

            "livePrice",

            "Unavailable"

        );


        setText(

            "currentPrice",

            "—"

        );


        setText(

            "srCurrentPrice",

            "—"

        );


        setText(

            "trend",

            "API connection error"

        );


        return null;

    }

}


/* =========================================================
   FETCH CANDLES
   ========================================================= */

async function fetchCandles(

    interval,

    outputsize = 250

) {

    try {

        const url =

            "https://api.twelvedata.com/time_series" +

            "?symbol=" +

            encodeURIComponent(SYMBOL) +

            "&interval=" +

            encodeURIComponent(interval) +

            "&outputsize=" +

            outputsize +

            "&format=JSON" +

            "&order=ASC" +

            "&apikey=" +

            encodeURIComponent(

                TWELVE_DATA_API_KEY

            );


        const response =

            await fetch(url);


        const data =

            await response.json();


        if (

            !data ||

            data.status === "error" ||

            !Array.isArray(data.values)

        ) {

            throw new Error(

                data && data.message

                    ? data.message

                    : "Candle data unavailable"

            );

        }


        return data.values.map(c => ({

            time: c.datetime,

            open: Number(c.open),

            high: Number(c.high),

            low: Number(c.low),

            close: Number(c.close),

            volume:

                finite(c.volume)

                    ? Number(c.volume)

                    : 0

        }));


    } catch (error) {

        console.error(

            "Candle error:",

            interval,

            error

        );


        return [];

    }

}


/* =========================================================
   H1 HOURLY SUPPORT & RESISTANCE
   ========================================================= */

function calculateHourlySR(

    data,

    price

) {

    if (

        !Array.isArray(data) ||

        data.length < 10 ||

        !finite(price)

    ) {

        return null;

    }


    const resistanceLevels = [];

    const supportLevels = [];


    /*
       Ignore the final H1 candle because it may
       still be forming.
    */

    const lastCompletedIndex =

        data.length - 2;


    const startIndex = Math.max(

        2,

        lastCompletedIndex -

        Engine3Config.H1_SR_LOOKBACK

    );


    const endIndex =

        lastCompletedIndex - 2;


    for (

        let i = startIndex;

        i <= endIndex;

        i++

    ) {


        /* -----------------------------------------
           H1 SWING HIGH
           ----------------------------------------- */

        if (

            isSwingHigh(

                data,

                i,

                Engine3Config.SWING_LOOKBACK

            )

        ) {

            const high =

                Number(data[i].high);


            if (

                finite(high) &&

                high > price

            ) {

                resistanceLevels.push(high);

            }

        }


        /* -----------------------------------------
           H1 SWING LOW
           ----------------------------------------- */

        if (

            isSwingLow(

                data,

                i,

                Engine3Config.SWING_LOOKBACK

            )

        ) {

            const low =

                Number(data[i].low);


            if (

                finite(low) &&

                low < price

            ) {

                supportLevels.push(low);

            }

        }

    }


    resistanceLevels.sort(

        (a, b) => a - b

    );


    supportLevels.sort(

        (a, b) => b - a

    );


    /*
       Remove duplicate / very close levels.
    */

    function uniqueLevels(levels) {

        const result = [];


        for (

            const level of levels

        ) {

            if (!result.length) {

                result.push(level);

                continue;

            }


            const previous =

                result[result.length - 1];


            if (

                Math.abs(level - previous) >

                0.00030

            ) {

                result.push(level);

            }

        }


        return result;

    }


    const uniqueResistance =

        uniqueLevels(

            resistanceLevels

        );


    const uniqueSupport =

        uniqueLevels(

            supportLevels

        );


    const r1 =

        uniqueResistance.length >= 1

            ? uniqueResistance[0]

            : null;


    const r2 =

        uniqueResistance.length >= 2

            ? uniqueResistance[1]

            : null;


    const s1 =

        uniqueSupport.length >= 1

            ? uniqueSupport[0]

            : null;


    const s2 =

        uniqueSupport.length >= 2

            ? uniqueSupport[1]

            : null;


    return {

        r1,

        r2,

        s1,

        s2,

        allResistance:

            uniqueResistance,

        allSupport:

            uniqueSupport

    };

}


/* =========================================================
   UPDATE H1 S/R DISPLAY
   ========================================================= */

function updateSRDisplay(sr) {

    /*
       IMPORTANT:

       S/R values are H1 hourly swing levels.

       Current Price is ALWAYS taken from
       the live Twelve Data price.
    */


    if (!sr) {

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


        /*
           CURRENT PRICE FIX
        */

        if (finite(livePrice)) {

            const formattedPrice =

                livePrice.toFixed(5);


            setText(

                "currentPrice",

                formattedPrice

            );


            setText(

                "srCurrentPrice",

                formattedPrice

            );

        }


        return;

    }


    /* =====================================================
       RESISTANCE 1
       ===================================================== */

    setText(

        "resistance1",

        finite(sr.r1)

            ? Number(sr.r1).toFixed(5)

            : "—"

    );


    /* =====================================================
       RESISTANCE 2
       ===================================================== */

    setText(

        "resistance2",

        finite(sr.r2)

            ? Number(sr.r2).toFixed(5)

            : "—"

    );


    /* =====================================================
       SUPPORT 1
       ===================================================== */

    setText(

        "support1",

        finite(sr.s1)

            ? Number(sr.s1).toFixed(5)

            : "—"

    );


    /* =====================================================
       SUPPORT 2
       ===================================================== */

    setText(

        "support2",

        finite(sr.s2)

            ? Number(sr.s2).toFixed(5)

            : "—"

    );


    /* =====================================================
       CURRENT PRICE — FIX
       ===================================================== */

    if (finite(livePrice)) {

        const formattedPrice =

            livePrice.toFixed(5);


        setText(

            "currentPrice",

            formattedPrice

        );


        setText(

            "srCurrentPrice",

            formattedPrice

        );

    }


    setText(

        "srStatus",

        "H1 Hourly Swing S/R"

    );


    console.log(

        "H1 SUPPORT / RESISTANCE:",

        sr

    );


    console.log(

        "S/R CURRENT PRICE:",

        livePrice

    );

}


/* =========================================================
   UPDATE HOURLY S/R
   ========================================================= */

function updateHourlySR() {

    if (

        !candles.H1 ||

        candles.H1.length < 10 ||

        !finite(livePrice)

    ) {

        hourlySR = null;

        updateSRDisplay(null);

        return null;

    }


    hourlySR =

        calculateHourlySR(

            candles.H1,

            livePrice

        );


    updateSRDisplay(

        hourlySR

    );


    /*
       FINAL CURRENT PRICE REFRESH

       This guarantees the S/R Current Price
       is populated after H1 calculation.
    */

    if (finite(livePrice)) {

        const formattedPrice =

            livePrice.toFixed(5);


        setText(

            "currentPrice",

            formattedPrice

        );


        setText(

            "srCurrentPrice",

            formattedPrice

        );

    }


    return hourlySR;

}


/* =========================================================
   EMA
   ========================================================= */

function calculateEMA(

    data,

    period

) {

    if (

        !Array.isArray(data) ||

        data.length < period

    ) {

        return null;

    }


    const closes =

        data.map(

            c => Number(c.close)

        );


    const multiplier =

        2 / (period + 1);


    let ema =

        closes

            .slice(0, period)

            .reduce(

                (a, b) => a + b,

                0

            ) /

        period;


    for (

        let i = period;

        i < closes.length;

        i++

    ) {

        ema =

            (closes[i] - ema) *

            multiplier +

            ema;

    }


    return ema;

}


/* =========================================================
   RSI
   ========================================================= */

function calculateRSI(

    data,

    period = 14

) {

    if (

        !Array.isArray(data) ||

        data.length < period + 1

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

            Number(data[i].close) -

            Number(data[i - 1].close);


        if (change >= 0) {

            gains += change;

        } else {

            losses += Math.abs(change);

        }

    }


    let avgGain =

        gains / period;


    let avgLoss =

        losses / period;


    for (

        let i = period + 1;

        i < data.length;

        i++

    ) {

        const change =

            Number(data[i].close) -

            Number(data[i - 1].close);


        const gain =

            Math.max(change, 0);


        const loss =

            Math.max(-change, 0);


        avgGain =

            ((avgGain * (period - 1)) +

            gain) /

            period;


        avgLoss =

            ((avgLoss * (period - 1)) +

            loss) /

            period;

    }


    if (avgLoss === 0) {

        return 100;

    }


    const rs =

        avgGain / avgLoss;


    return 100 -

        (100 / (1 + rs));

}


/* =========================================================
   ATR
   ========================================================= */

function calculateATR(

    data,

    period = 14

) {

    if (

        !Array.isArray(data) ||

        data.length < period + 1

    ) {

        return null;

    }


    const trs = [];


    for (

        let i = 1;

        i < data.length;

        i++

    ) {

        const high =

            Number(data[i].high);


        const low =

            Number(data[i].low);


        const previousClose =

            Number(

                data[i - 1].close

            );


        const tr =

            Math.max(

                high - low,

                Math.abs(

                    high -

                    previousClose

                ),

                Math.abs(

                    low -

                    previousClose

                )

            );


        trs.push(tr);

    }


    if (trs.length < period) {

        return null;

    }


    let atr =

        trs

            .slice(0, period)

            .reduce(

                (a, b) => a + b,

                0

            ) /

        period;


    for (

        let i = period;

        i < trs.length;

        i++

    ) {

        atr =

            ((atr * (period - 1)) +

            trs[i]) /

            period;

    }


    return atr;

}


/* =========================================================
   SWING HIGH
   ========================================================= */

function isSwingHigh(

    data,

    index,

    lookback = 2

) {

    if (

        index < lookback ||

        index >= data.length - lookback

    ) {

        return false;

    }


    const high =

        Number(data[index].high);


    for (

        let i = 1;

        i <= lookback;

        i++

    ) {

        if (

            high <=

                Number(

                    data[index - i].high

                ) ||

            high <=

                Number(

                    data[index + i].high

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

    data,

    index,

    lookback = 2

) {

    if (

        index < lookback ||

        index >= data.length - lookback

    ) {

        return false;

    }


    const low =

        Number(data[index].low);


    for (

        let i = 1;

        i <= lookback;

        i++

    ) {

        if (

            low >=

                Number(

                    data[index - i].low

                ) ||

            low >=

                Number(

                    data[index + i].low

                )

        ) {

            return false;

        }

    }


    return true;

}


/* =========================================================
   LATEST SWING HIGH
   ========================================================= */

function getLatestSwingHigh(

    data,

    lookback = 2

) {

    if (!Array.isArray(data)) {

        return null;

    }


    for (

        let i =

            data.length -

            lookback -

            1;

        i >= lookback;

        i--

    ) {

        if (

            isSwingHigh(

                data,

                i,

                lookback

            )

        ) {

            return Number(

                data[i].high

            );

        }

    }


    return null;

}


/* =========================================================
   LATEST SWING LOW
   ========================================================= */

function getLatestSwingLow(

    data,

    lookback = 2

) {

    if (!Array.isArray(data)) {

        return null;

    }


    for (

        let i =

            data.length -

            lookback -

            1;

        i >= lookback;

        i--

    ) {

        if (

            isSwingLow(

                data,

                i,

                lookback

            )

        ) {

            return Number(

                data[i].low

            );

        }

    }


    return null;

}


/* =========================================================
   MARKET STRUCTURE
   ========================================================= */

function getMarketStructure(data) {

    if (

        !Array.isArray(data) ||

        data.length < 10

    ) {

        return "UNKNOWN";

    }


    const highs = [];

    const lows = [];


    for (

        let i = 2;

        i < data.length - 2;

        i++

    ) {

        if (

            isSwingHigh(

                data,

                i,

                2

            )

        ) {

            highs.push(

                Number(

                    data[i].high

                )

            );

        }


        if (

            isSwingLow(

                data,

                i,

                2

            )

        ) {

            lows.push(

                Number(

                    data[i].low

                )

            );

        }

    }


    if (

        highs.length < 2 ||

        lows.length < 2

    ) {

        return "UNKNOWN";

    }


    const h1 =

        highs[highs.length - 2];


    const h2 =

        highs[highs.length - 1];


    const l1 =

        lows[lows.length - 2];


    const l2 =

        lows[lows.length - 1];


    if (

        h2 > h1 &&

        l2 > l1

    ) {

        return "BULLISH";

    }


    if (

        h2 < h1 &&

        l2 < l1

    ) {

        return "BEARISH";

    }


    return "RANGE";

}


/* =========================================================
   TIMEFRAME DIRECTION
   ========================================================= */

function getTimeframeDirection(data) {

    if (

        !Array.isArray(data) ||

        data.length < 50

    ) {

        return "UNKNOWN";

    }


    const price =

        Number(

            data[data.length - 1].close

        );


    const ema20 =

        calculateEMA(

            data,

            20

        );


    if (

        !finite(price) ||

        !finite(ema20)

    ) {

        return "UNKNOWN";

    }


    if (price > ema20) {

        return "BULLISH";

    }


    if (price < ema20) {

        return "BEARISH";

    }


    return "NEUTRAL";

}


/* =========================================================
   MOMENTUM
   ========================================================= */

function getMomentum(

    data,

    lookback = 5

) {

    if (

        !Array.isArray(data) ||

        data.length <= lookback

    ) {

        return "UNKNOWN";

    }


    const current =

        Number(

            data[data.length - 1].close

        );


    const previous =

        Number(

            data[

                data.length -

                1 -

                lookback

            ].close

        );


    if (

        !finite(current) ||

        !finite(previous)

    ) {

        return "UNKNOWN";

    }


    if (current > previous) {

        return "BULLISH";

    }


    if (current < previous) {

        return "BEARISH";

    }


    return "NEUTRAL";

}


/* =========================================================
   CANDLE QUALITY
   ========================================================= */

function evaluateCandleQuality(

    data,

    direction

) {

    if (

        !Array.isArray(data) ||

        data.length < 1

    ) {

        return {

            valid: false,

            status: "NO CANDLE"

        };

    }


    const c =

        data[data.length - 1];


    const open =

        Number(c.open);


    const high =

        Number(c.high);


    const low =

        Number(c.low);


    const close =

        Number(c.close);


    const range =

        high - low;


    if (range <= 0) {

        return {

            valid: false,

            status: "INVALID CANDLE"

        };

    }


    const body =

        Math.abs(

            close - open

        );


    const bodyRatio =

        body / range;


    if (direction === "BUY") {

        if (

            close > open &&

            bodyRatio >= 0.45

        ) {

            return {

                valid: true,

                status:

                    "BULLISH QUALITY"

            };

        }


        return {

            valid: false,

            status:

                "WEAK BUY CANDLE"

        };

    }


    if (direction === "SELL") {

        if (

            close < open &&

            bodyRatio >= 0.45

        ) {

            return {

                valid: true,

                status:

                    "BEARISH QUALITY"

            };

        }


        return {

            valid: false,

            status:

                "WEAK SELL CANDLE"

        };

    }


    return {

        valid: false,

        status:

            "UNKNOWN DIRECTION"

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


    if (direction === "BUY") {

        if (

            rsi >=

            Engine3Config.RSI_OVERBOUGHT

        ) {

            return {

                valid: false,

                status:

                    "BUY BLOCKED",

                reason:

                    "RSI overbought"

            };

        }


        if (

            rsi <

                Engine3Config.RSI_BUY_MIN ||

            rsi >

                Engine3Config.RSI_BUY_MAX

        ) {

            return {

                valid: false,

                status:

                    "BUY RSI UNSAFE",

                reason:

                    "RSI outside BUY safety range"

            };

        }


        return {

            valid: true,

            status:

                "BUY RSI SAFE",

            reason:

                "RSI within BUY safety range"

        };

    }


    if (direction === "SELL") {

        if (

            rsi <=

            Engine3Config.RSI_OVERSOLD

        ) {

            return {

                valid: false,

                status:

                    "SELL BLOCKED",

                reason:

                    "RSI oversold"

            };

        }


        if (

            rsi <

                Engine3Config.RSI_SELL_MIN ||

            rsi >

                Engine3Config.RSI_SELL_MAX

        ) {

            return {

                valid: false,

                status:

                    "SELL RSI UNSAFE",

                reason:

                    "RSI outside SELL safety range"

            };

        }


        return {

            valid: true,

            status:

                "SELL RSI SAFE",

            reason:

                "RSI within SELL safety range"

        };

    }


    return {

        valid: false,

        status:

            "DIRECTION UNKNOWN",

        reason:

            "Direction unavailable"

    };

}


/* =========================================================
   EMA EXTENSION PROTECTION
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

                "EMA EXTENSION UNKNOWN",

            reason:

                "EMA/ATR unavailable"

        };

    }


    const distance =

        Math.abs(

            price - ema20

        );


    const maxDistance =

        atr *

        Engine3Config.EMA_EXTENSION_ATR;


    if (

        distance >

        maxDistance

    ) {

        return {

            valid: false,

            status:

                "EMA EXTENDED",

            reason:

                "Price is more than 1.5 ATR from EMA20",

            distance,

            maxDistance

        };

    }


    return {

        valid: true,

        status:

            "EMA EXTENSION SAFE",

        reason:

            "Price is within EMA extension limit",

        distance,

        maxDistance

    };

}


/* =========================================================
   SESSION
   ========================================================= */

function getTradingSession() {

    const now = new Date();


    const hourText =

        now.toLocaleString(

            "en-US",

            {

                timeZone:

                    "Asia/Kolkata",

                hour:

                    "2-digit",

                hour12:

                    false

            }

        );


    const hour =

        Number(hourText);


    if (

        hour >= 13 &&

        hour < 18

    ) {

        return "LONDON";

    }


    if (

        hour >= 18 &&

        hour < 22

    ) {

        return "NEW YORK";

    }


    if (

        hour >= 22 ||

        hour < 3

    ) {

        return "NEW YORK / ASIA";

    }


    if (

        hour >= 3 &&

        hour < 7

    ) {

        return "ASIA";

    }


    return "OFF SESSION";

}


/* =========================================================
   H1 S/R TRADE LOGIC
   ========================================================= */

function evaluateHourlySR(

    price,

    direction,

    sr

) {

    if (

        !finite(price) ||

        !sr

    ) {

        return {

            valid: false,

            status:

                "H1 S/R UNKNOWN",

            reason:

                "H1 support/resistance unavailable"

        };

    }


    let opposingLevels = [];


    if (direction === "BUY") {

        opposingLevels =

            [

                sr.r1,

                sr.r2

            ]

            .filter(

                x =>

                    finite(x) &&

                    Number(x) > price

            )

            .sort(

                (a, b) => a - b

            );

    }


    if (direction === "SELL") {

        opposingLevels =

            [

                sr.s1,

                sr.s2

            ]

            .filter(

                x =>

                    finite(x) &&

                    Number(x) < price

            )

            .sort(

                (a, b) => b - a

            );

    }


    if (

        opposingLevels.length === 0

    ) {

        return {

            valid: false,

            status:

                "NO H1 TARGET",

            reason:

                "No opposing H1 level available"

        };

    }


    const nearest =

        Number(

            opposingLevels[0]

        );


    return {

        valid: true,

        status:

            "H1 S/R CLEAR",

        reason:

            "Opposing H1 level available",

        nearest,

        levels:

            opposingLevels

    };

}


/* =========================================================
   STRUCTURAL SL
   ========================================================= */

function calculateStructuralSL(

    data,

    direction,

    atr

) {

    if (

        !Array.isArray(data) ||

        data.length < 10

    ) {

        return null;

    }


    if (direction === "BUY") {

        const swingLow =

            getLatestSwingLow(

                data,

                Engine3Config.SWING_LOOKBACK

            );


        if (finite(swingLow)) {

            return swingLow;

        }


        if (

            finite(livePrice) &&

            finite(atr)

        ) {

            return (

                livePrice -

                atr * 1.5

            );

        }

    }


    if (direction === "SELL") {

        const swingHigh =

            getLatestSwingHigh(

                data,

                Engine3Config.SWING_LOOKBACK

            );


        if (finite(swingHigh)) {

            return swingHigh;

        }


        if (

            finite(livePrice) &&

            finite(atr)

        ) {

            return (

                livePrice +

                atr * 1.5

            );

        }

    }


    return null;

}


/* =========================================================
   TRADE LEVELS
   ========================================================= */

function calculateTradeLevels(

    price,

    direction,

    sl,

    sr

) {

    if (

        !finite(price) ||

        !finite(sl)

    ) {

        return {

            valid: false

        };

    }


    let targets = [];


    if (direction === "BUY") {

        targets =

            [

                sr?.r1,

                sr?.r2

            ]

            .filter(

                x =>

                    finite(x) &&

                    Number(x) > price

            )

            .sort(

                (a, b) => a - b

            );

    }


    if (direction === "SELL") {

        targets =

            [

                sr?.s1,

                sr?.s2

            ]

            .filter(

                x =>

                    finite(x) &&

                    Number(x) < price

            )

            .sort(

                (a, b) => b - a

            );

    }


    let tp1 = null;

    let tp2 = null;


    if (targets.length > 0) {

        tp1 =

            Number(

                targets[0]

            );

    }


    if (targets.length > 1) {

        tp2 =

            Number(

                targets[1]

            );

    }


    const risk =

        Math.abs(

            price - sl

        );


    if (!finite(tp1)) {

        if (direction === "BUY") {

            tp1 =

                price +

                risk * 2;

        } else {

            tp1 =

                price -

                risk * 2;

        }

    }


    if (!finite(tp2)) {

        if (direction === "BUY") {

            tp2 =

                price +

                risk * 3;

        } else {

            tp2 =

                price -

                risk * 3;

        }

    }


    let rr = 0;


    if (risk > 0) {

        const reward =

            Math.abs(

                tp1 - price

            );


        rr =

            reward / risk;

    }


    const valid =

        rr >=

        Engine3Config.MIN_RR;


    return {

        valid,

        entry: price,

        sl,

        tp1,

        tp2,

        risk,

        reward:

            Math.abs(

                tp1 - price

            ),

        rr

    };

}


/* =========================================================
   NEWS BLOCKER
   ========================================================= */

function evaluateNewsBlocker() {

    return {

        valid: false,

        known: false,

        status:

            "NEWS NOT CONFIRMED",

        reason:

            "Economic calendar not connected"

    };

}


/* =========================================================
   A+ REVERSAL
   ========================================================= */

function evaluateAPlusReversal(

    data,

    direction,

    rsi

) {

    if (

        !Array.isArray(data) ||

        data.length < 2 ||

        !finite(rsi)

    ) {

        return {

            valid: false,

            status:

                "NO REVERSAL"

        };

    }


    const last =

        data[data.length - 1];


    const previous =

        data[data.length - 2];


    const open =

        Number(last.open);


    const high =

        Number(last.high);


    const low =

        Number(last.low);


    const close =

        Number(last.close);


    const previousHigh =

        Number(previous.high);


    const previousLow =

        Number(previous.low);


    const range =

        high - low;


    if (range <= 0) {

        return {

            valid: false,

            status:

                "NO REVERSAL"

        };

    }


    const closePosition =

        (close - low) /

        range;


    if (direction === "BUY") {

        const bullish =

            close > open;


        const sweptLow =

            low < previousLow;


        const strongClose =

            closePosition >= 0.60;


        const rsiCondition =

            rsi < 45;


        if (

            bullish &&

            sweptLow &&

            strongClose &&

            rsiCondition

        ) {

            return {

                valid: true,

                status:

                    "A+ BUY REVERSAL",

                reason:

                    "Bullish sweep + strong close + RSI"

            };

        }

    }


    if (direction === "SELL") {

        const bearish =

            close < open;


        const sweptHigh =

            high > previousHigh;


        const strongClose =

            closePosition <= 0.40;


        const rsiCondition =

            rsi > 55;


        if (

            bearish &&

            sweptHigh &&

            strongClose &&

            rsiCondition

        ) {

            return {

                valid: true,

                status:

                    "A+ SELL REVERSAL",

                reason:

                    "Bearish sweep + strong close + RSI"

            };

        }

    }


    return {

        valid: false,

        status:

            "NO A+ REVERSAL"

    };

}


/* =========================================================
   ENGINE 3
   ELITE TRADE GATE
   ========================================================= */

function evaluateTradeGate() {

    const h4 = candles.H4;

    const h1 = candles.H1;

    const m15 = candles.M15;

    const m5 = candles.M5;


    if (

        !h4.length ||

        !h1.length ||

        !m15.length ||

        !m5.length

    ) {

        updateEngine3Display({

            decision: "WAIT",

            status:

                "INSUFFICIENT DATA",

            score: 0,

            maxScore: 11

        });

        return null;

    }


    if (m5.length < 200) {

        updateEngine3Display({

            decision: "WAIT",

            status:

                "M5 NEEDS 200+ CANDLES",

            score: 0,

            maxScore: 11

        });

        return null;

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

            status:

                "H4 / H1 NOT ALIGNED",

            score: 0,

            maxScore: 11

        });

        return null;

    }


    const m15Structure =

        getMarketStructure(m15);


    const m5Structure =

        getMarketStructure(m5);


    const structureValid =

        (

            direction === "BUY" &&

            m15Structure === "BULLISH" &&

            m5Structure === "BULLISH"

        )

        ||

        (

            direction === "SELL" &&

            m15Structure === "BEARISH" &&

            m5Structure === "BEARISH"

        );


    const m5EMA20 =

        calculateEMA(m5, 20);


    const m5EMA50 =

        calculateEMA(m5, 50);


    const m5EMA200 =

        calculateEMA(m5, 200);


    const m5Price =

        Number(

            m5[m5.length - 1].close

        );


    let emaValid = false;


    if (direction === "BUY") {

        emaValid =

            m5Price > m5EMA20 &&

            m5EMA20 > m5EMA50 &&

            m5EMA50 > m5EMA200;

    }


    if (direction === "SELL") {

        emaValid =

            m5Price < m5EMA20 &&

            m5EMA20 < m5EMA50 &&

            m5EMA50 < m5EMA200;

    }


    const rsi =

        calculateRSI(

            m5,

            14

        );


    const rsiProtection =

        getEliteRSIProtection(

            rsi,

            direction

        );


    const momentum =

        getMomentum(

            m5,

            Engine3Config.MOMENTUM_LOOKBACK

        );


    const momentumValid =

        (

            direction === "BUY" &&

            momentum === "BULLISH"

        )

        ||

        (

            direction === "SELL" &&

            momentum === "BEARISH"

        );


    const candleQuality =

        evaluateCandleQuality(

            m5,

            direction

        );


    const atr =

        calculateATR(

            m5,

            14

        );


    const extension =

        evaluateEMAExtension(

            m5Price,

            m5EMA20,

            atr,

            direction

        );


    const session =

        getTradingSession();


    const sessionValid =

        session !== "OFF SESSION";


    const structuralSL =

        calculateStructuralSL(

            m5,

            direction,

            atr

        );


    const srCheck =

        evaluateHourlySR(

            m5Price,

            direction,

            hourlySR

        );


    const tradeLevels =

        calculateTradeLevels(

            m5Price,

            direction,

            structuralSL,

            hourlySR

        );


    const rrValid =

        tradeLevels.valid &&

        tradeLevels.rr >=

            Engine3Config.MIN_RR;


    const news =

        evaluateNewsBlocker();


    const reversal =

        evaluateAPlusReversal(

            m5,

            direction,

            rsi

        );


    if (!rsiProtection.valid) {

        updateEngine3Display({

            decision: "BLOCKED",

            status:

                rsiProtection.status,

            direction,

            score: 0,

            maxScore: 11,

            reason:

                rsiProtection.reason

        });

        return null;

    }


    if (!extension.valid) {

        updateEngine3Display({

            decision: "BLOCKED",

            status:

                extension.status,

            direction,

            score: 0,

            maxScore: 11,

            reason:

                extension.reason

        });

        return null;

    }


    if (

        Engine3Config.NEWS_BLOCKER &&

        !news.valid

    ) {

        updateEngine3Display({

            decision: "BLOCKED",

            status:

                news.status,

            direction,

            score: 0,

            maxScore: 11,

            reason:

                news.reason

        });

        return null;

    }


    if (!srCheck.valid) {

        updateEngine3Display({

            decision: "BLOCKED",

            status:

                srCheck.status,

            direction,

            score: 0,

            maxScore: 11,

            reason:

                srCheck.reason

        });

        return null;

    }


    if (!rrValid) {

        updateEngine3Display({

            decision: "BLOCKED",

            status:

                "R:R BELOW 1:2",

            direction,

            score: 0,

            maxScore: 11,

            reason:

                "Real calculated R:R is below minimum 1:2"

        });

        return null;

    }


    let score = 0;


    if (direction) {

        score++;

    }


    if (structureValid) {

        score++;

    }


    if (emaValid) {

        score++;

    }


    if (rsiProtection.valid) {

        score++;

    }


    if (momentumValid) {

        score++;

    }


    if (candleQuality.valid) {

        score++;

    }


    if (extension.valid) {

        score++;

    }


    if (sessionValid) {

        score++;

    }


    if (srCheck.valid) {

        score++;

    }


    if (rrValid) {

        score++;

    }


    if (reversal.valid) {

        score++;

    }


    let decision =

        score >=

        Engine3Config.REQUIRED_SCORE

            ? direction

            : "WAIT";


    let status;


    if (decision === "BUY") {

        status =

            "A+ BUY CONDITIONS MET";

    }

    else if (decision === "SELL") {

        status =

            "A+ SELL CONDITIONS MET";

    }

    else {

        status =

            "WAIT FOR A+ SETUP";

    }


    const result = {

        decision,

        status,

        direction,

        score,

        maxScore: 11,

        h4Direction,

        h1Direction,

        m15Structure,

        m5Structure,

        structureValid,

        emaValid,

        rsi,

        rsiProtection,

        momentum,

        momentumValid,

        candleQuality,

        extension,

        session,

        sessionValid,

        hourlySR,

        srCheck,

        structuralSL,

        tradeLevels,

        rrValid,

        news,

        reversal

    };


    updateEngine3Display(

        result

    );


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

        "engine3Status",

        result.status || "WAIT"

    );


    setText(

        "engine3Score",

        (result.score ?? 0) +

        "/11"

    );


    if (result.direction) {

        setText(

            "engine3Direction",

            result.direction

        );

    }


    if (

        result.rsi !== undefined

    ) {

        setText(

            "engine3RSI",

            finite(result.rsi)

                ? Number(

                    result.rsi

                ).toFixed(1)

                : "—"

        );

    }


    if (

        result.structuralSL

    ) {

        setText(

            "engine3SL",

            formatPrice(

                result.structuralSL

            )

        );

    }


    if (

        result.tradeLevels &&

        finite(

            result.tradeLevels.tp1

        )

    ) {

        setText(

            "engine3TP1",

            formatPrice(

                result.tradeLevels.tp1

            )

        );

    }


    if (

        result.tradeLevels &&

        finite(

            result.tradeLevels.tp2

        )

    ) {

        setText(

            "engine3TP2",

            formatPrice(

                result.tradeLevels.tp2

            )

        );

    }


    if (

        result.tradeLevels &&

        finite(

            result.tradeLevels.rr

        )

    ) {

        setText(

            "engine3RR",

            "1:" +

            Number(

                result.tradeLevels.rr

            ).toFixed(2)

        );

    }

}


/* =========================================================
   TIMEFRAME DISPLAY
   ========================================================= */

function updateTimeframeDisplay(

    timeframe,

    data

) {

    if (

        !Array.isArray(data) ||

        data.length === 0

    ) {

        return;

    }


    const direction =

        getTimeframeDirection(

            data

        );


    const structure =

        getMarketStructure(

            data

        );


    const rsi =

        calculateRSI(

            data,

            14

        );


    const ema20 =

        calculateEMA(

            data,

            20

        );


    const prefix =

        timeframe.toLowerCase();


    setText(

        prefix +

        "Direction",

        direction

    );


    setText(

        prefix +

        "Structure",

        structure

    );


    setText(

        prefix +

        "RSI",

        finite(rsi)

            ? Number(

                rsi

            ).toFixed(1)

            : "—"

    );


    setText(

        prefix +

        "EMA",

        finite(ema20)

            ? Number(

                ema20

            ).toFixed(5)

            : "—"

    );

}


/* =========================================================
   M5 DISPLAY
   ========================================================= */

function updateM5Display() {

    const data =

        candles.M5;


    if (!data.length) {

        return;

    }


    const ema20 =

        calculateEMA(

            data,

            20

        );


    const ema50 =

        calculateEMA(

            data,

            50

        );


    const ema200 =

        calculateEMA(

            data,

            200

        );


    const rsi =

        calculateRSI(

            data,

            14

        );


    const momentum =

        getMomentum(

            data,

            Engine3Config.MOMENTUM_LOOKBACK

        );


    setText(

        "m5Candles",

        data.length

    );


    setText(

        "m5EMA20",

        formatPrice(

            ema20

        )

    );


    setText(

        "m5EMA50",

        formatPrice(

            ema50

        )

    );


    setText(

        "m5EMA200",

        formatPrice(

            ema200

        )

    );


    setText(

        "m5RSI",

        finite(rsi)

            ? Number(

                rsi

            ).toFixed(1)

            : "—"

    );


    setText(

        "m5Momentum",

        momentum

    );

}


/* =========================================================
   CHART
   ========================================================= */

function initializeChart() {

    const container =

        getElement("chart");


    if (

        !container ||

        typeof LightweightCharts ===

        "undefined"

    ) {

        console.warn(

            "Chart container or Lightweight Charts unavailable"

        );

        return;

    }


    try {

        container.innerHTML = "";


        chart =

            LightweightCharts.createChart(

                container,

                {

                    width:

                        container.clientWidth ||

                        800,

                    height: 400,

                    layout: {

                        background: {

                            color: "#030a12"

                        },

                        textColor:

                            "#ffffff"

                    },

                    grid: {

                        vertLines: {

                            color: "#14202b"

                        },

                        horzLines: {

                            color: "#14202b"

                        }

                    },

                    timeScale: {

                        timeVisible: true,

                        secondsVisible: false

                    }

                }

            );


        candleSeries =

            chart.addCandlestickSeries();


        window.addEventListener(

            "resize",

            () => {

                if (chart) {

                    chart.applyOptions({

                        width:

                            container.clientWidth

                    });

                }

            }

        );


    } catch (error) {

        console.error(

            "Chart initialization error:",

            error

        );

    }

}


/* =========================================================
   UPDATE CHART
   ========================================================= */

function updateChart() {

    if (

        !candleSeries ||

        !candles.M5.length

    ) {

        return;

    }


    try {

        const chartData =

            candles.M5

                .filter(

                    c =>

                        c.time &&

                        finite(c.open) &&

                        finite(c.high) &&

                        finite(c.low) &&

                        finite(c.close)

                )

                .map(c => ({

                    time:

                        Math.floor(

                            new Date(

                                c.time

                            ).getTime() /

                            1000

                        ),

                    open: c.open,

                    high: c.high,

                    low: c.low,

                    close: c.close

                }));


        if (chartData.length) {

            candleSeries.setData(

                chartData

            );

        }


    } catch (error) {

        console.error(

            "Chart update error:",

            error

        );

    }

}


/* =========================================================
   LOAD MARKET DATA
   ========================================================= */

async function loadMarketData() {

    console.log(

        "Loading EUR/USD market data..."

    );


    /* -----------------------------------------
       LIVE PRICE
       ----------------------------------------- */

    await fetchLivePrice();


    /*
       EXTRA CURRENT PRICE SYNC

       Make sure currentPrice is populated
       before H1 S/R calculation.
    */

    if (finite(livePrice)) {

        const formattedPrice =

            livePrice.toFixed(5);


        setText(

            "currentPrice",

            formattedPrice

        );


        setText(

            "srCurrentPrice",

            formattedPrice

        );

    }


    /* -----------------------------------------
       M5
       ----------------------------------------- */

    candles.M5 =

        await fetchCandles(

            "5min",

            250

        );


    updateChart();


    /* -----------------------------------------
       H4 / H1 / M15
       ----------------------------------------- */

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


    candles.H4 =

        results[0].status ===

        "fulfilled"

            ? results[0].value

            : [];


    candles.H1 =

        results[1].status ===

        "fulfilled"

            ? results[1].value

            : [];


    candles.M15 =

        results[2].status ===

        "fulfilled"

            ? results[2].value

            : [];


    /* -----------------------------------------
       H1 SUPPORT / RESISTANCE
       ----------------------------------------- */

    updateHourlySR();


    /* -----------------------------------------
       FINAL CURRENT PRICE SYNC
       ----------------------------------------- */

    if (finite(livePrice)) {

        const formattedPrice =

            livePrice.toFixed(5);


        setText(

            "currentPrice",

            formattedPrice

        );


        setText(

            "srCurrentPrice",

            formattedPrice

        );

    }


    /* -----------------------------------------
       TIMEFRAME DISPLAY
       ----------------------------------------- */

    updateTimeframeDisplay(

        "H4",

        candles.H4

    );


    updateTimeframeDisplay(

        "H1",

        candles.H1

    );


    updateTimeframeDisplay(

        "M15",

        candles.M15

    );


    updateM5Display();


    /* -----------------------------------------
       ENGINE 3
       ----------------------------------------- */

    evaluateTradeGate();


    console.log(

        "Market data update complete."

    );

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


    let button = null;


    for (

        const id of possibleIds

    ) {

        const el =

            getElement(id);


        if (el) {

            button = el;

            break;

        }

    }


    if (!button) {

        return;

    }


    button.addEventListener(

        "click",

        async () => {

            button.disabled = true;


            const originalText =

                button.textContent;


            button.textContent =

                "Refreshing...";


            try {

                await loadMarketData();

            }

            finally {

                button.disabled = false;

                button.textContent =

                    originalText;

            }

        }

    );

}


/* =========================================================
   AUTOMATIC REFRESH
   ========================================================= */

function startAutoRefresh() {

    if (refreshInterval) {

        clearInterval(

            refreshInterval

        );

    }


    refreshInterval =

        setInterval(

            loadMarketData,

            30000

        );

}


/* =========================================================
   START DASHBOARD
   ========================================================= */

let dashboardStarted = false;


async function startDashboard() {

    if (dashboardStarted) {

        return;

    }


    dashboardStarted = true;


    startClock();


    initializeChart();


    setupRefreshButton();


    await loadMarketData();


    startAutoRefresh();

}


/* =========================================================
   DOM READY
   ========================================================= */

if (

    document.readyState ===

    "loading"

) {

    document.addEventListener(

        "DOMContentLoaded",

        startDashboard

    );

}

else {

    startDashboard();

}
