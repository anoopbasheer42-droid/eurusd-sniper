
/* =========================================================
   EUR/USD SNIPER DASHBOARD
   DATA ENGINE V1
   ========================================================= */

"use strict";

/* =========================================================
   DATA ENGINE STATE
   ========================================================= */

const DataEngine = {

    pair: "EUR/USD",

    connected: false,

    lastUpdate: null,

    livePrice: null,

    candles: {

        H4: [],
        H1: [],
        M15: [],
        M5: []

    },

    status: {

        H4: "WAITING",
        H1: "WAITING",
        M15: "WAITING",
        M5: "WAITING",
        price: "WAITING"

    }

};


/* =========================================================
   CONFIGURATION
   ========================================================= */

const DataEngineConfig = {

    pair: "EUR/USD",

    timeframes: [
        "H4",
        "H1",
        "M15",
        "M5"
    ],

    /*
       Number of completed candles required later.

       We deliberately request enough history for:

       EMA 200
       RSI 14
       Momentum
       Swing structure
       S/R zones
    */

    candleLimit: 300,

    /*
       Live price and candle data will eventually
       be supplied by the secure market-data layer.

       DO NOT put an API secret here.
    */

    provider: null,

    refreshInterval: 30000

};


/* =========================================================
   VALIDATION
   ========================================================= */

function isValidNumber(value) {

    return Number.isFinite(
        Number(value)
    );

}


/* =========================================================
   CANDLE VALIDATION
   ========================================================= */

function validateCandle(candle) {

    if (!candle || typeof candle !== "object") {

        return false;

    }

    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);

    if (
        !Number.isFinite(open) ||
        !Number.isFinite(high) ||
        !Number.isFinite(low) ||
        !Number.isFinite(close)
    ) {

        return false;

    }

    if (high < low) {

        return false;

    }

    if (high < open || high < close) {

        return false;

    }

    if (low > open || low > close) {

        return false;

    }

    return true;

}


/* =========================================================
   NORMALIZE CANDLE
   ========================================================= */

function normalizeCandle(candle) {

    if (!validateCandle(candle)) {

        return null;

    }

    return {

        time:
            candle.time ??
            candle.timestamp ??
            null,

        open:
            Number(candle.open),

        high:
            Number(candle.high),

        low:
            Number(candle.low),

        close:
            Number(candle.close),

        volume:
            isValidNumber(candle.volume)
                ? Number(candle.volume)
                : null

    };

}


/* =========================================================
   SET CANDLES
   ========================================================= */

function setCandles(timeframe, candles) {

    if (!DataEngine.candles.hasOwnProperty(timeframe)) {

        console.warn(
            "Unknown timeframe:",
            timeframe
        );

        return false;

    }

    if (!Array.isArray(candles)) {

        console.warn(
            "Invalid candle array:",
            timeframe
        );

        return false;

    }

    const normalized = candles
        .map(normalizeCandle)
        .filter(Boolean);

    if (normalized.length === 0) {

        DataEngine.status[timeframe] =
            "NO DATA";

        return false;

    }

    /*
       Keep candles ordered oldest → newest.
    */

    normalized.sort(
        (a, b) =>
            Number(a.time || 0) -
            Number(b.time || 0)
    );

    DataEngine.candles[timeframe] =
        normalized.slice(
            -DataEngineConfig.candleLimit
        );

    DataEngine.status[timeframe] =
        "READY";

    return true;

}


/* =========================================================
   GET COMPLETED CANDLES
   ========================================================= */

function getCandles(timeframe) {

    if (!DataEngine.candles[timeframe]) {

        return [];

    }

    return [
        ...DataEngine.candles[timeframe]
    ];

}


/* =========================================================
   SET LIVE PRICE
   ========================================================= */

function setLivePrice(price) {

    const numericPrice =
        Number(price);

    if (!Number.isFinite(numericPrice)) {

        DataEngine.status.price =
            "INVALID";

        return false;

    }

    DataEngine.livePrice =
        numericPrice;

    DataEngine.status.price =
        "READY";

    DataEngine.lastUpdate =
        Date.now();

    return true;

}


/* =========================================================
   GET LIVE PRICE
   ========================================================= */

function getLivePrice() {

    return DataEngine.livePrice;

}


/* =========================================================
   MARKET DATA SNAPSHOT
   ========================================================= */

function getMarketSnapshot() {

    return {

        pair:
            DataEngine.pair,

        livePrice:
            DataEngine.livePrice,

        candles: {

            H4:
                getCandles("H4"),

            H1:
                getCandles("H1"),

            M15:
                getCandles("M15"),

            M5:
                getCandles("M5")

        },

        status:
            {
                ...DataEngine.status
            },

        connected:
            DataEngine.connected,

        lastUpdate:
            DataEngine.lastUpdate

    };

}


/* =========================================================
   DATA VALIDATION
   ========================================================= */

function validateMarketData() {

    const requiredTimeframes = [
        "H4",
        "H1",
        "M15",
        "M5"
    ];

    const result = {};

    for (
        const timeframe
        of requiredTimeframes
    ) {

        const candles =
            DataEngine.candles[timeframe];

        result[timeframe] =
            Array.isArray(candles) &&
            candles.length > 0;

    }

    result.price =
        Number.isFinite(
            DataEngine.livePrice
        );

    result.ready =
        result.H4 &&
        result.H1 &&
        result.M15 &&
        result.M5 &&
        result.price;

    return result;

}


/* =========================================================
   CONNECTION STATE
   ========================================================= */

function setConnectedState(connected) {

    DataEngine.connected =
        Boolean(connected);

}


/* =========================================================
   CLEAR DATA
   ========================================================= */

function clearMarketData() {

    DataEngine.livePrice =
        null;

    DataEngine.lastUpdate =
        null;

    DataEngine.connected =
        false;

    for (
        const timeframe
        of DataEngineConfig.timeframes
    ) {

        DataEngine.candles[timeframe] =
            [];

        DataEngine.status[timeframe] =
            "WAITING";

    }

    DataEngine.status.price =
        "WAITING";

}


/* =========================================================
   PROVIDER INTERFACE
   =========================================================

   The actual provider will be connected later.

   Keeping this separate means:

   Dashboard
        ↓
   Data Engine
        ↓
   Provider

   instead of putting provider-specific code
   throughout the dashboard.
   ========================================================= */

async function requestMarketData() {

    if (!DataEngineConfig.provider) {

        console.log(
            "DATA ENGINE: provider not connected."
        );

        setConnectedState(false);

        return false;

    }

    try {

        const result =
            await DataEngineConfig
                .provider
                .getMarketData(
                    DataEngineConfig.pair
                );

        if (!result) {

            throw new Error(
                "Empty market-data response."
            );

        }

        if (
            result.livePrice !== undefined
        ) {

            setLivePrice(
                result.livePrice
            );

        }

        for (
            const timeframe
            of DataEngineConfig.timeframes
        ) {

            if (
                Array.isArray(
                    result.candles?.[timeframe]
                )
            ) {

                setCandles(
                    timeframe,
                    result.candles[timeframe]
                );

            }

        }

        setConnectedState(
            validateMarketData().ready
        );

        return true;

    } catch (error) {

        console.error(
            "Market data error:",
            error
        );

        setConnectedState(false);

        return false;

    }

}


/* =========================================================
   REFRESH TIMER
   ========================================================= */

let dataEngineTimer =
    null;


function startDataEngine() {

    if (dataEngineTimer) {

        clearInterval(
            dataEngineTimer
        );

    }

    requestMarketData();

    dataEngineTimer =
        setInterval(
            requestMarketData,
            DataEngineConfig.refreshInterval
        );

}


/* =========================================================
   STOP DATA ENGINE
   ========================================================= */

function stopDataEngine() {

    if (!dataEngineTimer) {

        return;

    }

    clearInterval(
        dataEngineTimer
    );

    dataEngineTimer =
        null;

}


/* =========================================================
   DEBUG INFORMATION
   ========================================================= */

function getDataEngineStatus() {

    return {

        pair:
            DataEngine.pair,

        connected:
            DataEngine.connected,

        livePrice:
            DataEngine.livePrice,

        status:
            {
                ...DataEngine.status
            },

        validation:
            validateMarketData(),

        lastUpdate:
            DataEngine.lastUpdate

    };

}


/* =========================================================
   INITIALIZE
   ========================================================= */

function initializeDataEngine() {

    clearMarketData();

    console.log(
        "EUR/USD Data Engine V1 initialized."
    );

    console.log(
        "Waiting for secure market-data provider."
    );

}


/* =========================================================
   START
   ========================================================= */

initializeDataEngine();


/* =========================================================
   OPTIONAL GLOBAL ACCESS
   =========================================================

   Allows the dashboard to communicate with the
   data engine without duplicating state.
   ========================================================= */

window.DataEngine =
    DataEngine;

window.DataEngineConfig =
    DataEngineConfig;

window.getMarketSnapshot =
    getMarketSnapshot;

window.getDataEngineStatus =
    getDataEngineStatus;

window.startDataEngine =
    startDataEngine;

window.stopDataEngine =
    stopDataEngine;
