/* =========================================================
   EUR/USD SNIPER DASHBOARD
   ELITE TRADE GATE
   FULL MARKET ENGINE
   CORRECTED LIVE VERSION
   =========================================================

   ENGINE 1 = A+ SNIPER
   ENGINE 2 = SCALP
   ENGINE 3 = ELITE TRADE GATE

   DATA:
   Twelve Data

   TIMEFRAMES:
   H4 / H1 / M15 / M5

   IMPORTANT:
   Replace ONLY the API key below if required.
   ========================================================= */


/* =========================================================
   CONFIG
   ========================================================= */

const TWELVE_DATA_API_KEY = "53821bf38bec40e4a88bd1fa06ac32b3";

const SYMBOL = "EUR/USD";

const REFRESH_INTERVAL = 60000;

const CANDLE_LIMIT = 220;

const SWING_LOOKBACK = 2;

const H1_SR_LOOKBACK = 120;


/* =========================================================
   ENGINE 3 CONFIG
   ========================================================= */

const Engine3Config = {

    RSI_PERIOD: 14,

    RSI_BUY_MIN: 35,

    RSI_BUY_MAX: 68,

    RSI_SELL_MIN: 32,

    RSI_SELL_MAX: 65,

    RSI_OVERBOUGHT: 70,

    RSI_OVERSOLD: 30,

    EMA_EXTENSION_ATR: 1.5,

    MIN_RR: 2,

    REQUIRED_SCORE: 8,

    STRUCTURE_LOOKBACK: 20,

    MOMENTUM_LOOKBACK: 5,

    NEWS_BLOCKER: true

};


/* =========================================================
   GLOBAL DATA
   ========================================================= */

let marketData = {

    H4: [],

    H1: [],

    M15: [],

    M5: []

};

let livePrice = null;

let currentTimeframe = "M5";

let chartCanvas = null;

let chartContext = null;

let dashboardStarted = false;

let loadingMarketData = false;


/* =========================================================
   DOM HELPERS
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


/* =========================================================
   ROBUST TEXT UPDATE
   ========================================================= */

function setManyText(ids, value) {

    ids.forEach(id => {

        const el = document.getElementById(id);

        if (el) {

            el.textContent = value;

        }

    });

}


/*
   Extra fallback updater.

   This allows the script to update elements even when
   the HTML uses slightly different IDs/classes.
*/

function setSelectorText(selectors, value) {

    selectors.forEach(selector => {

        try {

            document
                .querySelectorAll(selector)
                .forEach(el => {

                    el.textContent = value;

                });

        }

        catch (error) {

            console.warn(

                "Selector error:",

                selector

            );

        }

    });

}


/* =========================================================
   PRICE FORMAT
   ========================================================= */

function formatPrice(value) {

    if (

        value === null ||

        value === undefined

    ) {

        return "—";

    }


    const number = Number(value);


    if (!Number.isFinite(number)) {

        return "—";

    }


    return number.toFixed(5);

}


function formatNumber(value, decimals = 2) {

    if (

        value === null ||

        value === undefined

    ) {

        return "—";

    }


    const number = Number(value);


    if (!Number.isFinite(number)) {

        return "—";

    }


    return number.toFixed(decimals);

}


/* =========================================================
   UPDATE ALL LIVE PRICE LOCATIONS
   ========================================================= */

function updateAllPriceDisplays(price) {

    if (!Number.isFinite(price)) {

        return;

    }


    const formatted = formatPrice(price);


    /*
       Main dashboard price
    */

    setManyText(

        [

            "price",

            "livePrice",

            "currentPrice",

            "chartPrice",

            "currentPriceValue",

            "livePriceValue",

            "priceValue",

            "live-price",

            "current-price"

        ],

        formatted

    );


    /*
       Support / Resistance current price
    */

    setManyText(

        [

            "srCurrentPrice",

            "srCurrentPriceValue",

            "sr-current-price",

            "sr-current-price-value",

            "srPrice",

            "srCurrent"

        ],

        formatted

    );


    /*
       Risk / Reward entry
    */

    setManyText(

        [

            "riskLivePrice",

            "riskEntry",

            "entryPrice",

            "livePriceEntry",

            "riskRewardEntry"

        ],

        formatted

    );


    /*
       Fallback class selectors
    */

    setSelectorText(

        [

            ".live-price",

            ".livePrice",

            ".current-price",

            ".currentPrice",

            ".sr-current-price",

            ".srCurrentPrice",

            "[data-live-price]",

            "[data-current-price]"

        ],

        formatted

    );

}


/* =========================================================
   INDIA TIME
   ========================================================= */

function updateIndiaTime() {

    try {

        const now = new Date();


        const india = new Intl.DateTimeFormat(

            "en-IN",

            {

                timeZone: "Asia/Kolkata",

                hour: "2-digit",

                minute: "2-digit",

                second: "2-digit",

                hour12: false

            }

        ).format(now);


        setManyText(

            [

                "indiaTime",

                "india-time",

                "clock",

                "time",

                "currentTime",

                "india-time-value"

            ],

            india

        );


        setSelectorText(

            [

                ".india-time",

                ".indiaTime",

                ".clock",

                "[data-india-time]"

            ],

            india

        );


        updateTradingSession();

    }

    catch (error) {

        console.error(

            "India time error:",

            error

        );

    }

}


/* =========================================================
   FOREX SESSION
   ========================================================= */

function getTradingSession() {

    const now = new Date();

    const utcHour = now.getUTCHours();

    const utcMinute = now.getUTCMinutes();

    const minutes =

        utcHour * 60 +

        utcMinute;


    const london =

        minutes >= 7 * 60 &&

        minutes < 16 * 60;


    const newYork =

        minutes >= 12 * 60 &&

        minutes < 21 * 60;


    const asia =

        minutes >= 0 &&

        minutes < 8 * 60;


    const sydney =

        minutes >= 21 * 60 ||

        minutes < 6 * 60;


    if (london && newYork) {

        return {

            name: "LONDON + NEW YORK",

            active: true,

            score: 1

        };

    }


    if (london) {

        return {

            name: "LONDON",

            active: true,

            score: 1

        };

    }


    if (newYork) {

        return {

            name: "NEW YORK",

            active: true,

            score: 1

        };

    }


    if (asia) {

        return {

            name: "ASIA",

            active: true,

            score: 0

        };

    }


    if (sydney) {

        return {

            name: "SYDNEY",

            active: true,

            score: 0

        };

    }


    return {

        name: "OFF SESSION",

        active: false,

        score: 0

    };

}


function updateTradingSession() {

    const session = getTradingSession();


    setManyText(

        [

            "session",

            "tradingSession",

            "currentSession",

            "sessionValue",

            "sessionName",

            "current-session"

        ],

        session.name

    );


    setSelectorText(

        [

            ".session",

            ".trading-session",

            ".current-session",

            "[data-session]"

        ],

        session.name

    );

}


/* =========================================================
   TWELVE DATA REQUEST
   ========================================================= */

async function twelveData(endpoint, params = {}) {

    const url = new URL(

        "https://api.twelvedata.com/" +

        endpoint

    );


    url.searchParams.set(

        "apikey",

        TWELVE_DATA_API_KEY

    );


    Object.keys(params).forEach(key => {

        url.searchParams.set(

            key,

            params[key]

        );

    });


    const response = await fetch(

        url.toString(),

        {

            cache: "no-store"

        }

    );


    if (!response.ok) {

        throw new Error(

            "HTTP " + response.status

        );

    }


    const data = await response.json();


    if (data.status === "error") {

        throw new Error(

            data.message ||

            "Twelve Data error"

        );

    }


    return data;

}


/* =========================================================
   LIVE PRICE
   ========================================================= */

async function fetchLivePrice() {

    try {

        const data = await twelveData(

            "price",

            {

                symbol: SYMBOL

            }

        );


        const price = Number(data.price);


        if (!Number.isFinite(price)) {

            throw new Error(

                "Invalid live price"

            );

        }


        livePrice = price;


        /*
           IMPORTANT:
           Update immediately.
        */

        updateAllPriceDisplays(price);


        setManyText(

            [

                "priceStatus",

                "dataStatus",

                "marketStatus",

                "chartStatus"

            ],

            "LIVE"

        );


        return price;

    }

    catch (error) {

        console.error(

            "Live price error:",

            error

        );


        /*
           Keep previous live price if available.
        */

        if (Number.isFinite(livePrice)) {

            updateAllPriceDisplays(

                livePrice

            );

        }


        return livePrice;

    }

}


/* =========================================================
   CANDLE FETCH
   ========================================================= */

async function fetchCandles(interval) {

    try {

        const data = await twelveData(

            "time_series",

            {

                symbol: SYMBOL,

                interval: interval,

                outputsize: CANDLE_LIMIT,

                timezone: "UTC",

                order: "ASC"

            }

        );


        if (

            !data.values ||

            !Array.isArray(data.values)

        ) {

            throw new Error(

                "No candle values returned"

            );

        }


        const candles = data.values

            .map(c => {

                const timestamp =

                    new Date(

                        c.datetime

                    ).getTime();


                return {

                    time:

                        Number.isFinite(timestamp)

                            ? Math.floor(

                                timestamp / 1000

                              )

                            : 0,

                    open:

                        Number(c.open),

                    high:

                        Number(c.high),

                    low:

                        Number(c.low),

                    close:

                        Number(c.close),

                    volume:

                        Number(c.volume || 0)

                };

            })

            .filter(c =>

                Number.isFinite(c.open) &&

                Number.isFinite(c.high) &&

                Number.isFinite(c.low) &&

                Number.isFinite(c.close)

            );


        /*
           Guarantee chronological order.
        */

        candles.sort(

            (a, b) => a.time - b.time

        );


        return candles;

    }

    catch (error) {

        console.error(

            interval +

            " candle error:",

            error

        );


        return [];

    }

}


/* =========================================================
   LOAD ALL MARKET DATA
   ========================================================= */

async function loadAllCandles() {

    const results = {};


    /*
       Deliberately slower requests.

       This reduces Twelve Data rate-limit failures.
    */

    results.H4 =

        await fetchCandles("4h");


    await sleep(1200);


    results.H1 =

        await fetchCandles("1h");


    await sleep(1200);


    results.M15 =

        await fetchCandles("15min");


    await sleep(1200);


    results.M5 =

        await fetchCandles("5min");


    marketData.H4 = results.H4;

    marketData.H1 = results.H1;

    marketData.M15 = results.M15;

    marketData.M5 = results.M5;


    console.log(

        "Market candles loaded:",

        {

            H4: marketData.H4.length,

            H1: marketData.H1.length,

            M15: marketData.M15.length,

            M5: marketData.M5.length

        }

    );


    return results;

}


function sleep(ms) {

    return new Promise(

        resolve => setTimeout(

            resolve,

            ms

        )

    );

}


/* =========================================================
   EMA
   ========================================================= */

function calculateEMA(values, period) {

    if (

        !values ||

        values.length < period

    ) {

        return null;

    }


    const multiplier =

        2 / (period + 1);


    let ema = 0;


    for (

        let i = 0;

        i < period;

        i++

    ) {

        ema += Number(values[i]);

    }


    ema /= period;


    for (

        let i = period;

        i < values.length;

        i++

    ) {

        ema =

            (

                Number(values[i]) -

                ema

            ) *

            multiplier +

            ema;

    }


    return ema;

}


function getCloses(candles) {

    return candles.map(

        c => Number(c.close)

    );

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


    const closes =

        getCloses(candles);


    let gains = 0;

    let losses = 0;


    for (

        let i = 1;

        i <= period;

        i++

    ) {

        const difference =

            closes[i] -

            closes[i - 1];


        if (difference > 0) {

            gains += difference;

        }

        else {

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

        i < closes.length;

        i++

    ) {

        const difference =

            closes[i] -

            closes[i - 1];


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

        !candles ||

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

        const current =

            candles[i];


        const previous =

            candles[i - 1];


        const tr = Math.max(

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


        trueRanges.push(tr);

    }


    if (

        trueRanges.length < period

    ) {

        return null;

    }


    let atr = 0;


    for (

        let i = 0;

        i < period;

        i++

    ) {

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
   SWING HIGH / LOW
   ========================================================= */

function isSwingHigh(

    candles,

    index,

    lookback = 2

) {

    if (

        index < lookback ||

        index >=

            candles.length -

            lookback

    ) {

        return false;

    }


    const value =

        candles[index].high;


    for (

        let i =

            index - lookback;

        i <=

            index + lookback;

        i++

    ) {

        if (i === index) {

            continue;

        }


        if (

            candles[i].high >=

            value

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

    if (

        index < lookback ||

        index >=

            candles.length -

            lookback

    ) {

        return false;

    }


    const value =

        candles[index].low;


    for (

        let i =

            index - lookback;

        i <=

            index + lookback;

        i++

    ) {

        if (i === index) {

            continue;

        }


        if (

            candles[i].low <=

            value

        ) {

            return false;

        }

    }


    return true;

}


/* =========================================================
   LATEST SWINGS
   ========================================================= */

function getLatestSwingHigh(candles) {

    if (

        !candles ||

        candles.length < 10

    ) {

        return null;

    }


    for (

        let i =

            candles.length - 3;

        i >= SWING_LOOKBACK;

        i--

    ) {

        if (

            isSwingHigh(

                candles,

                i,

                SWING_LOOKBACK

            )

        ) {

            return candles[i].high;

        }

    }


    return null;

}


function getLatestSwingLow(candles) {

    if (

        !candles ||

        candles.length < 10

    ) {

        return null;

    }


    for (

        let i =

            candles.length - 3;

        i >= SWING_LOOKBACK;

        i--

    ) {

        if (

            isSwingLow(

                candles,

                i,

                SWING_LOOKBACK

            )

        ) {

            return candles[i].low;

        }

    }


    return null;

}


/* =========================================================
   MARKET STRUCTURE
   ========================================================= */

function getMarketStructure(candles) {

    if (

        !candles ||

        candles.length < 20

    ) {

        return "WAITING";

    }


    const highs = [];

    const lows = [];


    for (

        let i = SWING_LOOKBACK;

        i <

            candles.length -

            SWING_LOOKBACK;

        i++

    ) {

        if (

            isSwingHigh(

                candles,

                i,

                SWING_LOOKBACK

            )

        ) {

            highs.push(

                candles[i].high

            );

        }


        if (

            isSwingLow(

                candles,

                i,

                SWING_LOOKBACK

            )

        ) {

            lows.push(

                candles[i].low

            );

        }

    }


    if (

        highs.length < 2 ||

        lows.length < 2

    ) {

        return "WAITING";

    }


    const lastHigh =

        highs[highs.length - 1];


    const previousHigh =

        highs[highs.length - 2];


    const lastLow =

        lows[lows.length - 1];


    const previousLow =

        lows[lows.length - 2];


    if (

        lastHigh > previousHigh &&

        lastLow > previousLow

    ) {

        return "BULLISH";

    }


    if (

        lastHigh < previousHigh &&

        lastLow < previousLow

    ) {

        return "BEARISH";

    }


    return "RANGING";

}


/* =========================================================
   TIMEFRAME DIRECTION
   ========================================================= */

function getTimeframeDirection(candles) {

    if (

        !candles ||

        candles.length < 50

    ) {

        return "WAITING";

    }


    const closes =

        getCloses(candles);


    const price =

        closes[closes.length - 1];


    const ema20 =

        calculateEMA(

            closes,

            20

        );


    if (

        ema20 === null ||

        !Number.isFinite(price)

    ) {

        return "WAITING";

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
   EMA ALIGNMENT
   ========================================================= */

function getEMAAlignment(

    candles,

    direction

) {

    if (

        !candles ||

        candles.length < 200

    ) {

        return "WAITING";

    }


    const closes =

        getCloses(candles);


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


    if (

        ema20 === null ||

        ema50 === null ||

        ema200 === null

    ) {

        return "WAITING";

    }


    if (direction === "BUY") {

        return (

            ema20 > ema50 &&

            ema50 > ema200

        )

            ? "ALIGNED"

            : "NOT ALIGNED";

    }


    if (direction === "SELL") {

        return (

            ema20 < ema50 &&

            ema50 < ema200

        )

            ? "ALIGNED"

            : "NOT ALIGNED";

    }


    return "WAITING";

}


/* =========================================================
   MOMENTUM
   ========================================================= */

function getMomentum(candles) {

    if (

        !candles ||

        candles.length < 10

    ) {

        return "WAITING";

    }


    const last =

        candles.length - 1;


    const previous =

        last -

        Engine3Config.MOMENTUM_LOOKBACK;


    const difference =

        candles[last].close -

        candles[previous].close;


    if (difference > 0) {

        return "BULLISH";

    }


    if (difference < 0) {

        return "BEARISH";

    }


    return "NEUTRAL";

}


/* =========================================================
   CANDLE QUALITY
   ========================================================= */

function getCandleQuality(candles) {

    if (

        !candles ||

        candles.length < 2

    ) {

        return "WAITING";

    }


    const candle =

        candles[candles.length - 1];


    const range =

        candle.high -

        candle.low;


    if (range <= 0) {

        return "INVALID";

    }


    const body = Math.abs(

        candle.close -

        candle.open

    );


    const bodyPercent =

        body / range;


    if (bodyPercent >= 0.60) {

        return "STRONG";

    }


    if (bodyPercent >= 0.35) {

        return "VALID";

    }


    return "WEAK";

}


/* =========================================================
   EMA EXTENSION
   ========================================================= */

function evaluateEMAExtension(candles) {

    if (

        !candles ||

        candles.length < 50

    ) {

        return {

            valid: false,

            status: "DATA WAITING",

            distance: null,

            atr: null

        };

    }


    const closes =

        getCloses(candles);


    const price =

        closes[closes.length - 1];


    const ema20 =

        calculateEMA(

            closes,

            20

        );


    const atr =

        calculateATR(

            candles,

            14

        );


    if (

        ema20 === null ||

        atr === null ||

        atr <= 0

    ) {

        return {

            valid: false,

            status: "DATA WAITING",

            distance: null,

            atr: null

        };

    }


    const distance = Math.abs(

        price -

        ema20

    );


    const maximum =

        atr *

        Engine3Config.EMA_EXTENSION_ATR;


    const valid =

        distance <= maximum;


    return {

        valid,

        status: valid

            ? "VALID"

            : "OVEREXTENDED",

        distance,

        atr

    };

}


/* =========================================================
   H1 SUPPORT / RESISTANCE
   ========================================================= */

function calculateHourlySR(candles) {

    if (

        !candles ||

        candles.length < 20

    ) {

        return {

            r1: null,

            r2: null,

            s1: null,

            s2: null

        };

    }


    /*
       IMPORTANT:
       Use only COMPLETED H1 candles.

       The latest H1 candle may still be forming.
    */

    const completedEnd =

        candles.length - 2;


    const start = Math.max(

        SWING_LOOKBACK,

        completedEnd -

        H1_SR_LOOKBACK

    );


    /*
       IMPORTANT:
       S/R is calculated against the
       LIVE PRICE, not the last H1 close.
    */

    const referencePrice =

        Number.isFinite(livePrice)

            ? livePrice

            : candles[completedEnd].close;


    const resistance = [];

    const support = [];


    for (

        let i = start;

        i <=

            completedEnd -

            SWING_LOOKBACK;

        i++

    ) {

        if (

            isSwingHigh(

                candles,

                i,

                SWING_LOOKBACK

            )

        ) {

            const high =

                candles[i].high;


            if (

                high >

                referencePrice

            ) {

                resistance.push(high);

            }

        }


        if (

            isSwingLow(

                candles,

                i,

                SWING_LOOKBACK

            )

        ) {

            const low =

                candles[i].low;


            if (

                low <

                referencePrice

            ) {

                support.push(low);

            }

        }

    }


    function uniqueSorted(

        values,

        descending

    ) {

        const result = [];


        values

            .sort(

                descending

                    ? (a, b) => b - a

                    : (a, b) => a - b

            )

            .forEach(value => {

                const exists =

                    result.some(

                        existing =>

                            Math.abs(

                                existing -

                                value

                            ) <=

                            0.00030

                    );


                if (!exists) {

                    result.push(value);

                }

            });


        return result;

    }


    const r = uniqueSorted(

        resistance,

        false

    );


    const s = uniqueSorted(

        support,

        true

    );


    return {

        r1: r[0] ?? null,

        r2: r[1] ?? null,

        s1: s[0] ?? null,

        s2: s[1] ?? null

    };

}


/* =========================================================
   S/R DISPLAY
   ========================================================= */

function updateSRDisplay(sr) {

    setManyText(

        [

            "r1",

            "resistance1",

            "resistanceOne",

            "resistance-1",

            "srR1"

        ],

        formatPrice(sr.r1)

    );


    setManyText(

        [

            "r2",

            "resistance2",

            "resistanceTwo",

            "resistance-2",

            "srR2"

        ],

        formatPrice(sr.r2)

    );


    setManyText(

        [

            "s1",

            "support1",

            "supportOne",

            "support-1",

            "srS1"

        ],

        formatPrice(sr.s1)

    );


    setManyText(

        [

            "s2",

            "support2",

            "supportTwo",

            "support-2",

            "srS2"

        ],

        formatPrice(sr.s2)

    );


    /*
       CRITICAL FIX:
       Always use the REAL LIVE PRICE here.
    */

    if (

        Number.isFinite(livePrice)

    ) {

        updateAllPriceDisplays(

            livePrice

        );

    }

}


/* =========================================================
   S/R VALIDATION
   ========================================================= */

function evaluateHourlySR(

    sr,

    price,

    direction

) {

    if (

        !sr ||

        !Number.isFinite(price)

    ) {

        return {

            valid: false,

            status: "DATA WAITING",

            reason:

                "H1 S/R unavailable"

        };

    }


    if (direction === "BUY") {

        const resistance = sr.r1;


        if (

            !Number.isFinite(

                resistance

            )

        ) {

            return {

                valid: false,

                status: "NO RESISTANCE",

                reason:

                    "No H1 resistance above price"

            };

        }


        if (

            resistance <= price

        ) {

            return {

                valid: false,

                status: "BLOCKED",

                reason:

                    "Price above H1 resistance"

            };

        }


        return {

            valid: true,

            status: "VALID",

            reason:

                "Room to H1 resistance"

        };

    }


    if (direction === "SELL") {

        const support = sr.s1;


        if (

            !Number.isFinite(

                support

            )

        ) {

            return {

                valid: false,

                status: "NO SUPPORT",

                reason:

                    "No H1 support below price"

            };

        }


        if (

            support >= price

        ) {

            return {

                valid: false,

                status: "BLOCKED",

                reason:

                    "Price below H1 support"

            };

        }


        return {

            valid: true,

            status: "VALID",

            reason:

                "Room to H1 support"

        };

    }


    return {

        valid: false,

        status: "WAITING",

        reason:

            "Direction unavailable"

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

            status:

                "RSI DATA UNAVAILABLE",

            reason:

                "RSI unavailable"

        };

    }


    if (

        rsi >=

        Engine3Config.RSI_OVERBOUGHT

    ) {

        if (direction === "BUY") {

            return {

                valid: false,

                status: "BLOCKED",

                reason:

                    "BUY RSI overbought"

            };

        }

    }


    if (

        rsi <=

        Engine3Config.RSI_OVERSOLD

    ) {

        if (direction === "SELL") {

            return {

                valid: false,

                status: "BLOCKED",

                reason:

                    "SELL RSI oversold"

            };

        }

    }


    if (direction === "BUY") {

        const valid =

            rsi >=

                Engine3Config.RSI_BUY_MIN &&

            rsi <=

                Engine3Config.RSI_BUY_MAX;


        return {

            valid,

            status: valid

                ? "SAFE"

                : "OUTSIDE BUY ZONE",

            reason: valid

                ? "BUY RSI safe"

                : "BUY RSI not safe"

        };

    }


    if (direction === "SELL") {

        const valid =

            rsi >=

                Engine3Config.RSI_SELL_MIN &&

            rsi <=

                Engine3Config.RSI_SELL_MAX;


        return {

            valid,

            status: valid

                ? "SAFE"

                : "OUTSIDE SELL ZONE",

            reason: valid

                ? "SELL RSI safe"

                : "SELL RSI not safe"

        };

    }


    return {

        valid: false,

        status: "WAITING",

        reason:

            "Direction unavailable"

    };

}


/* =========================================================
   A+ REVERSAL
   ========================================================= */

function evaluateAPlusReversal(

    candles,

    rsi

) {

    if (

        !candles ||

        candles.length < 3 ||

        !Number.isFinite(rsi)

    ) {

        return {

            valid: false,

            status: "WAITING",

            direction: null

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

            status: "INVALID",

            direction: null

        };

    }


    const closePosition =

        (

            current.close -

            current.low

        ) / range;


    const buyReversal =

        current.close >

            current.open &&

        current.low <

            previous.low &&

        closePosition >= 0.60 &&

        rsi < 45;


    const sellReversal =

        current.close <

            current.open &&

        current.high >

            previous.high &&

        closePosition <= 0.40 &&

        rsi > 55;


    if (buyReversal) {

        return {

            valid: true,

            status: "BUY REVERSAL",

            direction: "BUY"

        };

    }


    if (sellReversal) {

        return {

            valid: true,

            status: "SELL REVERSAL",

            direction: "SELL"

        };

    }


    return {

        valid: false,

        status: "NO REVERSAL",

        direction: null

    };

}


/* =========================================================
   STRUCTURAL STOP LOSS
   ========================================================= */

function calculateStructuralSL(

    candles,

    direction,

    entry

) {

    if (

        !candles ||

        candles.length < 10 ||

        !Number.isFinite(entry)

    ) {

        return null;

    }


    const swingLow =

        getLatestSwingLow(candles);


    const swingHigh =

        getLatestSwingHigh(candles);


    if (direction === "BUY") {

        if (

            swingLow !== null &&

            swingLow < entry

        ) {

            return swingLow;

        }


        const atr =

            calculateATR(

                candles,

                14

            );


        if (atr !== null) {

            return entry - atr;

        }

    }


    if (direction === "SELL") {

        if (

            swingHigh !== null &&

            swingHigh > entry

        ) {

            return swingHigh;

        }


        const atr =

            calculateATR(

                candles,

                14

            );


        if (atr !== null) {

            return entry + atr;

        }

    }


    return null;

}


/* =========================================================
   TRADE LEVELS
   ========================================================= */

function calculateTradeLevels(

    candles,

    direction,

    entry,

    sr

) {

    if (!direction) {

        return {

            sl: null,

            tp1: null,

            tp2: null,

            rr: null

        };

    }


    const sl =

        calculateStructuralSL(

            candles,

            direction,

            entry

        );


    if (

        sl === null ||

        !Number.isFinite(sl)

    ) {

        return {

            sl: null,

            tp1: null,

            tp2: null,

            rr: null

        };

    }


    const risk = Math.abs(

        entry - sl

    );


    if (risk <= 0) {

        return {

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


        if (

            Number.isFinite(sr?.r1) &&

            sr.r1 > entry &&

            sr.r1 < tp2

        ) {

            tp2 = sr.r1;

        }

    }


    else {

        tp1 =

            entry -

            risk * 2;


        tp2 =

            entry -

            risk * 3;


        if (

            Number.isFinite(sr?.s1) &&

            sr.s1 < entry &&

            sr.s1 > tp2

        ) {

            tp2 = sr.s1;

        }

    }


    const reward =

        direction === "BUY"

            ? tp2 - entry

            : entry - tp2;


    const rr =

        reward / risk;


    return {

        sl,

        tp1,

        tp2,

        rr

    };

}


/* =========================================================
   NEWS BLOCKER
   ========================================================= */

function evaluateNewsBlocker() {

    if (

        Engine3Config.NEWS_BLOCKER

    ) {

        return {

            valid: false,

            status:

                "NEWS NOT CONFIRMED",

            reason:

                "Economic calendar not connected"

        };

    }


    return {

        valid: true,

        status: "CLEAR",

        reason:

            "News blocker disabled"

    };

}


/* =========================================================
   DIRECTION
   ========================================================= */

function determineTradeDirection() {

    const h4 =

        getTimeframeDirection(

            marketData.H4

        );


    const h1 =

        getTimeframeDirection(

            marketData.H1

        );


    if (

        h4 === "BULLISH" &&

        h1 === "BULLISH"

    ) {

        return "BUY";

    }


    if (

        h4 === "BEARISH" &&

        h1 === "BEARISH"

    ) {

        return "SELL";

    }


    return null;

}


/* =========================================================
   TIMEFRAME DISPLAY
   ========================================================= */

function updateTimeframeDisplays() {

    const frames = [

        {

            name: "H4",

            data: marketData.H4

        },

        {

            name: "H1",

            data: marketData.H1

        },

        {

            name: "M15",

            data: marketData.M15

        },

        {

            name: "M5",

            data: marketData.M5

        }

    ];


    frames.forEach(frame => {

        const data =

            frame.data;


        if (

            !data ||

            data.length < 5

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


        const high =

            getLatestSwingHigh(

                data

            );


        const low =

            getLatestSwingLow(

                data

            );


        const p =

            frame.name.toLowerCase();


        setManyText(

            [

                p + "Direction",

                p + "-direction"

            ],

            direction

        );


        setManyText(

            [

                p + "Structure",

                p + "-structure"

            ],

            structure

        );


        setManyText(

            [

                p + "SwingHigh",

                p + "Swing High",

                p + "-swing-high"

            ],

            formatPrice(high)

        );


        setManyText(

            [

                p + "SwingLow",

                p + "Swing Low",

                p + "-swing-low"

            ],

            formatPrice(low)

        );

    });


    const m15 =

        marketData.M15;


    if (m15.length) {

        const m15Structure =

            getMarketStructure(

                m15

            );


        setManyText(

            [

                "m15Structure",

                "m15-structure"

            ],

            m15Structure

        );


        setManyText(

            [

                "m15Trend",

                "m15-trend",

                "m15Direction"

            ],

            getTimeframeDirection(

                m15

            )

        );


        const direction =

            determineTradeDirection();


        setManyText(

            [

                "m15EMAAlignment",

                "m15-ema-alignment",

                "m15EMA"

            ],

            getEMAAlignment(

                m15,

                direction || "BUY"

            )

        );


        setManyText(

            [

                "m15Liquidity",

                "m15-liquidity"

            ],

            getLiquidityStatus(

                m15

            )

        );

    }


    const m5 =

        marketData.M5;


    if (m5.length) {

        const direction =

            determineTradeDirection();


        setManyText(

            [

                "m5Structure",

                "m5-structure"

            ],

            getMarketStructure(

                m5

            )

        );


        setManyText(

            [

                "m5EMAAlignment",

                "m5-ema-alignment"

            ],

            getEMAAlignment(

                m5,

                direction || "BUY"

            )

        );


        setManyText(

            [

                "m5Direction",

                "m5-direction"

            ],

            getTimeframeDirection(

                m5

            )

        );

    }

}


/* =========================================================
   LIQUIDITY
   ========================================================= */

function getLiquidityStatus(candles) {

    if (

        !candles ||

        candles.length < 20

    ) {

        return "WAITING";

    }


    /*
       FIX:
       Exclude the latest candle from the
       reference range.

       Otherwise the latest high can never
       be greater than itself.
    */

    const latest =

        candles[candles.length - 1];


    const previousCandles =

        candles.slice(-11, -1);


    const high = Math.max(

        ...previousCandles.map(

            c => c.high

        )

    );


    const low = Math.min(

        ...previousCandles.map(

            c => c.low

        )

    );


    if (

        latest.high > high &&

        latest.close <

            latest.open

    ) {

        return "HIGH SWEEP";

    }


    if (

        latest.low < low &&

        latest.close >

            latest.open

    ) {

        return "LOW SWEEP";

    }


    return "NORMAL";

}


/* =========================================================
   M5 KEY INDICATORS
   ========================================================= */

function updateM5Indicators() {

    const candles =

        marketData.M5;


    if (

        !candles ||

        candles.length < 20

    ) {

        return;

    }


    const closes =

        getCloses(candles);


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

            candles,

            14

        );


    const momentum =

        getMomentum(candles);


    const candleQuality =

        getCandleQuality(

            candles

        );


    const extension =

        evaluateEMAExtension(

            candles

        );


    setManyText(

        [

            "ema20",

            "m5EMA20",

            "m5-ema20"

        ],

        formatPrice(ema20)

    );


    setManyText(

        [

            "ema50",

            "m5EMA50",

            "m5-ema50"

        ],

        formatPrice(ema50)

    );


    setManyText(

        [

            "ema200",

            "m5EMA200",

            "m5-ema200"

        ],

        formatPrice(ema200)

    );


    setManyText(

        [

            "rsi",

            "m5RSI",

            "m5-rsi"

        ],

        formatNumber(

            rsi,

            2

        )

    );


    setManyText(

        [

            "momentum",

            "m5Momentum",

            "m5-momentum"

        ],

        momentum

    );


    setManyText(

        [

            "candleQuality",

            "m5CandleQuality",

            "m5-candle-quality"

        ],

        candleQuality

    );


    setManyText(

        [

            "emaExtension",

            "m5EMAExtension",

            "m5-ema-extension"

        ],

        extension.status

    );

}


/* =========================================================
   ENGINE 3
   ========================================================= */

function evaluateTradeGate() {

    const m5 = marketData.M5;

    const m15 = marketData.M15;

    const h1 = marketData.H1;

    const h4 = marketData.H4;


    if (

        m5.length < 50 ||

        m15.length < 20 ||

        h1.length < 20 ||

        h4.length < 20

    ) {

        return {

            decision: "WAIT",

            score: 0,

            maxScore: 14,

            direction: null,

            reason:

                "Waiting for sufficient market data",

            checks: {}

        };

    }


    const direction =

        determineTradeDirection();


    const h4Direction =

        getTimeframeDirection(

            h4

        );


    const h1Direction =

        getTimeframeDirection(

            h1

        );


    const h4h1Agree =

        direction !== null;


    const m15Structure =

        getMarketStructure(

            m15

        );


    const m5Structure =

        getMarketStructure(

            m5

        );


    const structureAgree =

        (

            direction === "BUY" &&

            m15Structure ===

                "BULLISH" &&

            m5Structure ===

                "BULLISH"

        ) ||

        (

            direction === "SELL" &&

            m15Structure ===

                "BEARISH" &&

            m5Structure ===

                "BEARISH"

        );


    const emaAlignment =

        getEMAAlignment(

            m5,

            direction

        );


    const emaPass =

        emaAlignment ===

        "ALIGNED";


    const rsi =

        calculateRSI(

            m5,

            Engine3Config.RSI_PERIOD

        );


    const rsiProtection =

        getEliteRSIProtection(

            rsi,

            direction

        );


    const momentum =

        getMomentum(m5);


    const momentumPass =

        (

            direction === "BUY" &&

            momentum ===

                "BULLISH"

        ) ||

        (

            direction === "SELL" &&

            momentum ===

                "BEARISH"

        );


    const candleQuality =

        getCandleQuality(m5);


    const candlePass =

        candleQuality ===

            "STRONG" ||

        candleQuality ===

            "VALID";


    const extension =

        evaluateEMAExtension(m5);


    const session =

        getTradingSession();


    const sr =

        calculateHourlySR(h1);


    const price =

        Number.isFinite(

            livePrice

        )

            ? livePrice

            : m5[m5.length - 1].close;


    const srCheck =

        evaluateHourlySR(

            sr,

            price,

            direction

        );


    const tradeLevels =

        calculateTradeLevels(

            m5,

            direction,

            price,

            sr

        );


    const rrPass =

        Number.isFinite(

            tradeLevels.rr

        ) &&

        tradeLevels.rr >=

            Engine3Config.MIN_RR;


    const news =

        evaluateNewsBlocker();


    const reversal =

        evaluateAPlusReversal(

            m5,

            rsi

        );


    let score = 0;


    if (h4h1Agree) score++;

    if (structureAgree) score++;

    if (emaPass) score++;

    if (rsiProtection.valid) score++;

    if (

        rsiProtection.status !==

        "RSI DATA UNAVAILABLE"

    ) score++;

    if (momentumPass) score++;

    if (candlePass) score++;

    if (extension.valid) score++;

    if (session.active) score++;

    if (srCheck.valid) score++;

    if (news.valid) score++;

    if (

        tradeLevels.sl !== null

    ) score++;

    if (rrPass) score++;

    if (reversal.valid) score++;


    const hardBlockers = [];


    if (!direction) {

        hardBlockers.push(

            "H4/H1 direction not aligned"

        );

    }


    if (!rsiProtection.valid) {

        hardBlockers.push(

            "RSI protection failed"

        );

    }


    if (!extension.valid) {

        hardBlockers.push(

            "EMA extension protection failed"

        );

    }


    if (!srCheck.valid) {

        hardBlockers.push(

            "H1 S/R validation failed"

        );

    }


    if (!news.valid) {

        hardBlockers.push(

            "NEWS NOT CONFIRMED"

        );

    }


    if (!rrPass) {

        hardBlockers.push(

            "Real R:R below 1:2"

        );

    }


    let decision = "WAIT";


    if (

        hardBlockers.length === 0 &&

        score >=

            Engine3Config.REQUIRED_SCORE

    ) {

        decision =

            direction === "BUY"

                ? "BUY"

                : "SELL";

    }


    return {

        decision,

        score,

        maxScore: 14,

        direction,

        reason:

            hardBlockers.length

                ? hardBlockers[0]

                : "A+ conditions confirmed",

        hardBlockers,

        checks: {

            h4h1Agree,

            structureAgree,

            emaPass,

            rsiProtection,

            momentumPass,

            candlePass,

            candleQuality,

            extension,

            session,

            srCheck,

            news,

            structuralSL:

                tradeLevels.sl !== null,

            rrPass,

            reversal,

            tradeLevels

        },

        h4Direction,

        h1Direction,

        m15Structure,

        m5Structure,

        rsi,

        momentum,

        emaAlignment,

        sr

    };

}


/* =========================================================
   ENGINE 3 DISPLAY
   ========================================================= */

function updateEngine3Display(result) {

    setManyText(

        [

            "engine3Decision",

            "gateDecision",

            "tradeDecision",

            "engine3Status"

        ],

        result.decision

    );


    setManyText(

        [

            "engine3Score",

            "gateScore",

            "aPlusScore"

        ],

        result.score +

        " / " +

        result.maxScore

    );


    setManyText(

        [

            "engine3Reason",

            "gateReason",

            "aPlusReason"

        ],

        result.reason

    );


    const checks =

        result.checks || {};


    updateCheck(

        [

            "h4h1Agree",

            "h4H1Agree",

            "checkH4H1"

        ],

        checks.h4h1Agree,

        result.direction

            ? "CONFIRMED"

            : "PENDING"

    );


    updateCheck(

        [

            "m15m5Structure",

            "m15M5Structure",

            "checkStructure"

        ],

        checks.structureAgree,

        checks.structureAgree

            ? "CONFIRMED"

            : "NOT ALIGNED"

    );


    updateCheck(

        [

            "m5EMAAlignment",

            "checkEMA"

        ],

        checks.emaPass,

        result.emaAlignment

    );


    updateCheck(

        [

            "rsiSafety",

            "checkRSI"

        ],

        checks.rsiProtection?.valid,

        checks.rsiProtection?.status ||

        "PENDING"

    );


    updateCheck(

        [

            "rsiProtection",

            "rsiOverboughtOversold",

            "checkRSIProtection"

        ],

        checks.rsiProtection?.valid,

        checks.rsiProtection?.status ||

        "PENDING"

    );


    updateCheck(

        [

            "momentumCheck",

            "checkMomentum"

        ],

        checks.momentumPass,

        result.momentum

    );


    updateCheck(

        [

            "candleCheck",

            "checkCandle"

        ],

        checks.candlePass,

        checks.candleQuality

    );


    updateCheck(

        [

            "emaExtensionCheck",

            "checkExtension"

        ],

        checks.extension?.valid,

        checks.extension?.status ||

        "PENDING"

    );


    updateCheck(

        [

            "sessionCheck",

            "checkSession"

        ],

        checks.session?.active,

        checks.session?.name ||

        "CONTEXT"

    );


    updateCheck(

        [

            "srCheck",

            "supportResistanceCheck",

            "checkSR"

        ],

        checks.srCheck?.valid,

        checks.srCheck?.status ||

        "PENDING"

    );


    updateCheck(

        [

            "newsCheck",

            "newsBlockerCheck",

            "checkNews"

        ],

        checks.news?.valid,

        checks.news?.status ||

        "PENDING"

    );


    updateCheck(

        [

            "structuralSLCheck",

            "checkSL"

        ],

        checks.structuralSL,

        checks.structuralSL

            ? "VALID"

            : "PENDING"

    );


    updateCheck(

        [

            "rrCheck",

            "realRRCheck",

            "checkRR"

        ],

        checks.rrPass,

        Number.isFinite(

            checks.tradeLevels?.rr

        )

            ? "1:" +

              formatNumber(

                  checks.tradeLevels.rr,

                  2

              )

            : "PENDING"

    );


    updateCheck(

        [

            "reversalCheck",

            "aPlusReversalCheck",

            "checkReversal"

        ],

        checks.reversal?.valid,

        checks.reversal?.status ||

        "NO REVERSAL"

    );


    const levels =

        checks.tradeLevels || {};


    /*
       Always use the real live price
       for entry.
    */

    if (

        Number.isFinite(livePrice)

    ) {

        updateAllPriceDisplays(

            livePrice

        );

    }


    setManyText(

        [

            "structuralSL",

            "sl",

            "stopLoss"

        ],

        formatPrice(levels.sl)

    );


    setManyText(

        [

            "tp1",

            "takeProfit1"

        ],

        formatPrice(levels.tp1)

    );


    setManyText(

        [

            "tp2",

            "takeProfit2"

        ],

        formatPrice(levels.tp2)

    );


    setManyText(

        [

            "actualRR",

            "realRR",

            "riskReward"

        ],

        Number.isFinite(

            levels.rr

        )

            ? "1:" +

              formatNumber(

                  levels.rr,

                  2

              )

            : "—"

    );

}


function updateCheck(

    ids,

    passed,

    status

) {

    ids.forEach(id => {

        const el =

            getElement(id);


        if (!el) return;


        el.textContent =

            status ||

            "PENDING";


        if (passed === true) {

            el.dataset.status =

                "pass";

        }

        else if (passed === false) {

            el.dataset.status =

                "fail";

        }

        else {

            el.dataset.status =

                "pending";

        }

    });

}


/* =========================================================
   NEWS DISPLAY
   ========================================================= */

function updateNewsDisplay() {

    setManyText(

        [

            "economicCalendar",

            "newsStatus",

            "calendarStatus"

        ],

        "WAITING"

    );


    setManyText(

        [

            "eurEvents",

            "eurEventsValue"

        ],

        "—"

    );


    setManyText(

        [

            "usdEvents",

            "usdEventsValue"

        ],

        "—"

    );


    setManyText(

        [

            "highImpact",

            "highImpactValue"

        ],

        "NOT CONNECTED"

    );

}


/* =========================================================
   CHART ENGINE
   ========================================================= */

function findChartContainer() {

    const ids = [

        "chart",

        "liveChart",

        "chartContainer",

        "priceChart",

        "live-chart",

        "chart-area"

    ];


    for (

        const id of ids

    ) {

        const el =

            getElement(id);


        if (el) {

            return el;

        }

    }


    const candidates =

        document.querySelectorAll(

            "[class*='chart'], [id*='chart']"

        );


    if (

        candidates.length

    ) {

        return candidates[0];

    }


    return null;

}


function setupChartCanvas() {

    const container =

        findChartContainer();


    if (!container) {

        console.warn(

            "Chart container not found"

        );

        return false;

    }


    let canvas =

        container.querySelector(

            "canvas.sniperChartCanvas"

        );


    if (!canvas) {

        canvas =

            document.createElement(

                "canvas"

            );


        canvas.className =

            "sniperChartCanvas";


        canvas.style.width =

            "100%";


        canvas.style.height =

            "320px";


        canvas.style.minHeight =

            "320px";


        canvas.style.display =

            "block";


        container.appendChild(

            canvas

        );

    }


    chartCanvas = canvas;


    chartContext =

        canvas.getContext("2d");


    resizeChartCanvas();


    window.addEventListener(

        "resize",

        resizeChartCanvas

    );


    return true;

}


function resizeChartCanvas() {

    if (!chartCanvas) {

        return;

    }


    const rect =

        chartCanvas.parentElement

            .getBoundingClientRect();


    const width = Math.max(

        rect.width,

        300

    );


    const height = Math.max(

        rect.height,

        320

    );


    const ratio =

        window.devicePixelRatio ||

        1;


    chartCanvas.width =

        width * ratio;


    chartCanvas.height =

        height * ratio;


    chartCanvas.style.width =

        width + "px";


    chartCanvas.style.height =

        height + "px";


    chartContext.setTransform(

        ratio,

        0,

        0,

        ratio,

        0,

        0

    );


    drawChart();

}


/* =========================================================
   DRAW CHART
   ========================================================= */

function drawChart() {

    if (

        !chartContext ||

        !chartCanvas

    ) {

        return;

    }


    const candles =

        marketData[

            currentTimeframe

        ] || [];


    const width =

        chartCanvas.clientWidth;


    const height =

        chartCanvas.clientHeight;


    chartContext.clearRect(

        0,

        0,

        width,

        height

    );


    chartContext.fillStyle =

        "#030a12";


    chartContext.fillRect(

        0,

        0,

        width,

        height

    );


    if (!candles.length) {

        chartContext.fillStyle =

            "#9aa7b5";


        chartContext.font =

            "16px Arial";


        chartContext.textAlign =

            "center";


        chartContext.fillText(

            "Waiting for real EUR/USD candle data",

            width / 2,

            height / 2

        );


        chartContext.fillText(

            "No simulated market data",

            width / 2,

            height / 2 + 28

        );


        return;

    }


    const visible =

        candles.slice(-80);


    let min = Infinity;

    let max = -Infinity;


    visible.forEach(c => {

        min = Math.min(

            min,

            c.low

        );


        max = Math.max(

            max,

            c.high

        );

    });


    if (

        !Number.isFinite(min) ||

        !Number.isFinite(max) ||

        max <= min

    ) {

        return;

    }


    const padding =

        (max - min) * 0.08;


    min -= padding;

    max += padding;


    const chartTop = 20;

    const chartBottom =

        height - 35;


    const chartHeight =

        chartBottom -

        chartTop;


    function y(price) {

        return chartBottom -

            (

                (price - min) /

                (max - min)

            ) *

            chartHeight;

    }


    chartContext.strokeStyle =

        "rgba(255,255,255,0.08)";


    chartContext.lineWidth = 1;


    for (

        let i = 0;

        i <= 5;

        i++

    ) {

        const yy =

            chartTop +

            (

                chartHeight / 5

            ) * i;


        chartContext.beginPath();


        chartContext.moveTo(

            0,

            yy

        );


        chartContext.lineTo(

            width,

            yy

        );


        chartContext.stroke();


        const price =

            max -

            (

                (max - min) /

                5

            ) * i;


        chartContext.fillStyle =

            "#7f8c99";


        chartContext.font =

            "11px Arial";


        chartContext.textAlign =

            "left";


        chartContext.fillText(

            price.toFixed(5),

            5,

            yy - 3

        );

    }


    const candleWidth =

        width /

        visible.length;


    visible.forEach(

        (candle, index) => {

            const x =

                index *

                candleWidth +

                candleWidth / 2;


            const openY =

                y(candle.open);


            const closeY =

                y(candle.close);


            const highY =

                y(candle.high);


            const lowY =

                y(candle.low);


            const bullish =

                candle.close >=

                candle.open;


            chartContext.strokeStyle =

                bullish

                    ? "#20d47a"

                    : "#ff4d5a";


            chartContext.fillStyle =

                bullish

                    ? "#20d47a"

                    : "#ff4d5a";


            chartContext.beginPath();


            chartContext.moveTo(

                x,

                highY

            );


            chartContext.lineTo(

                x,

                lowY

            );


            chartContext.stroke();


            const bodyTop =

                Math.min(

                    openY,

                    closeY

                );


            const bodyHeight =

                Math.max(

                    Math.abs(

                        closeY -

                        openY

                    ),

                    1

                );


            chartContext.fillRect(

                x -

                    candleWidth *

                    0.30,

                bodyTop,

                candleWidth *

                    0.60,

                bodyHeight

            );

        }

    );


    drawIndicatorLine(

        visible,

        20,

        "#f0c674",

        y,

        width

    );


    /*
       LIVE PRICE LINE
    */

    if (

        Number.isFinite(

            livePrice

        )

    ) {

        const liveY =

            y(livePrice);


        chartContext.strokeStyle =

            "#ffffff";


        chartContext.setLineDash(

            [5, 5]

        );


        chartContext.beginPath();


        chartContext.moveTo(

            0,

            liveY

        );


        chartContext.lineTo(

            width,

            liveY

        );


        chartContext.stroke();


        chartContext.setLineDash([]);


        chartContext.fillStyle =

            "#ffffff";


        chartContext.font =

            "bold 12px Arial";


        chartContext.textAlign =

            "right";


        chartContext.fillText(

            formatPrice(

                livePrice

            ),

            width - 8,

            liveY - 5

        );

    }

}


/* =========================================================
   DRAW EMA LINE
   ========================================================= */

function drawIndicatorLine(

    candles,

    period,

    stroke,

    y,

    width

) {

    if (

        candles.length < period

    ) {

        return;

    }


    const closes =

        candles.map(

            c => c.close

        );


    const multiplier =

        2 /

        (period + 1);


    let ema = 0;


    for (

        let i = 0;

        i < period;

        i++

    ) {

        ema += closes[i];

    }


    ema /= period;


    const values = [];


    values[period - 1] = ema;


    for (

        let i = period;

        i < closes.length;

        i++

    ) {

        ema =

            (

                closes[i] -

                ema

            ) *

            multiplier +

            ema;


        values[i] = ema;

    }


    chartContext.strokeStyle =

        stroke;


    chartContext.lineWidth =

        1.5;


    chartContext.beginPath();


    let started = false;


    values.forEach(

        (value, index) => {

            if (

                value === undefined

            ) {

                return;

            }


            const x =

                (

                    index /

                    (candles.length - 1)

                ) *

                width;


            const yy = y(value);


            if (!started) {

                chartContext.moveTo(

                    x,

                    yy

                );

                started = true;

            }

            else {

                chartContext.lineTo(

                    x,

                    yy

                );

            }

        }

    );


    chartContext.stroke();

}


/* =========================================================
   CHART BUTTONS
   ========================================================= */

function setupChartButtons() {

    const buttons =

        document.querySelectorAll(

            "[data-timeframe]"

        );


    buttons.forEach(button => {

        button.addEventListener(

            "click",

            () => {

                const tf =

                    button.dataset.timeframe;


                if (

                    marketData[tf]

                ) {

                    currentTimeframe =

                        tf;


                    drawChart();

                }

            }

        );

    });


    const mappings = {

        chartH4: "H4",

        chartH1: "H1",

        chartM15: "M15",

        chartM5: "M5",

        h4Chart: "H4",

        h1Chart: "H1",

        m15Chart: "M15",

        m5Chart: "M5"

    };


    Object.keys(

        mappings

    ).forEach(id => {

        const el =

            getElement(id);


        if (!el) return;


        el.addEventListener(

            "click",

            () => {

                currentTimeframe =

                    mappings[id];


                drawChart();

            }

        );

    });

}


/* =========================================================
   REFRESH BUTTON
   ========================================================= */

function setupRefreshButton() {

    const ids = [

        "refresh",

        "refreshBtn",

        "refreshDashboard",

        "refreshData"

    ];


    ids.forEach(id => {

        const button =

            getElement(id);


        if (!button) return;


        button.addEventListener(

            "click",

            async () => {

                await loadMarketData();

            }

        );

    });

}


/* =========================================================
   MAIN MARKET ENGINE
   ========================================================= */

async function loadMarketData() {

    if (loadingMarketData) {

        return;

    }


    loadingMarketData = true;


    try {

        /*
           1. LIVE PRICE FIRST
        */

        await fetchLivePrice();


        /*
           2. MARKET CANDLES
        */

        await loadAllCandles();


        /*
           3. H1 SUPPORT / RESISTANCE
        */

        if (

            marketData.H1.length >= 20

        ) {

            const sr =

                calculateHourlySR(

                    marketData.H1

                );


            updateSRDisplay(sr);

        }


        /*
           4. TIMEFRAME ANALYSIS
        */

        updateTimeframeDisplays();


        /*
           5. M5 INDICATORS
        */

        updateM5Indicators();


        /*
           6. NEWS
        */

        updateNewsDisplay();


        /*
           7. ENGINE 3
        */

        const gate =

            evaluateTradeGate();


        updateEngine3Display(

            gate

        );


        /*
           8. CHART
        */

        drawChart();


        /*
           9. FINAL LIVE PRICE SYNC
        */

        if (

            Number.isFinite(

                livePrice

            )

        ) {

            updateAllPriceDisplays(

                livePrice

            );

        }


        /*
           10. STATUS
        */

        const totalCandles =

            marketData.H4.length +

            marketData.H1.length +

            marketData.M15.length +

            marketData.M5.length;


        if (totalCandles > 0) {

            setManyText(

                [

                    "dataStatus",

                    "marketStatus",

                    "chartStatus"

                ],

                "LIVE DATA"

            );

        }

    }

    catch (error) {

        console.error(

            "Dashboard error:",

            error

        );

    }

    finally {

        loadingMarketData = false;

    }

}


/* =========================================================
   START DASHBOARD
   ========================================================= */

async function startDashboard() {

    if (dashboardStarted) {

        return;

    }


    dashboardStarted = true;


    /*
       INDIA CLOCK IMMEDIATELY
    */

    updateIndiaTime();


    setInterval(

        updateIndiaTime,

        1000

    );


    /*
       CHART
    */

    setupChartCanvas();

    setupChartButtons();

    setupRefreshButton();


    /*
       PRICE FIRST
    */

    await fetchLivePrice();


    /*
       FULL LOAD
    */

    await loadMarketData();


    /*
       AUTO REFRESH
    */

    setInterval(

        async () => {

            await loadMarketData();

        },

        REFRESH_INTERVAL

    );

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


/* =========================================================
   DEBUG ACCESS
   ========================================================= */

window.EURUSDSniper = {

    marketData,

    getLivePrice:

        () => livePrice,

    refresh:

        loadMarketData,

    engine3:

        evaluateTradeGate,

    calculateHourlySR,

    calculateEMA,

    calculateRSI,

    calculateATR

};
