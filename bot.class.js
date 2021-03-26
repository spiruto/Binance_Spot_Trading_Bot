const a = require("axios").default;
const c = require("chalk");
const m = require("nodemailer");
const s = require("crypto");
const l = console.log;
const cs = console.clear;
const t = require("telegraf").Telegram;
const ws = require("ws");
const {
  StatusCodeWarning,
  MailerError,
  MaintenanceMode,
  TelegramBotError,
  NoPairsInMarket,
  NoBalancesAvailable,
} = require("./exceptions");
const API_URL = "https://api.binance.com";
const WS_URL = "wss://stream.binance.com:9443";
const ENDPOINTS = require("./endPoints.json");
/**
 * @class
 * @name Bot
 * @description Creates a trader bot that works with the Binance API directly under the hood with the user specifications
 * @param {object} config - Configuration for the bot
 * @param {object} config.mailer - Mailing system configuration
 * @param {string} config.mailer.host - Host where the mailer will connect
 * @param {number} config.mailer.port - Port of the mailer
 * @param {boolean} config.mailer.useSSL - Wether to use secure protocols
 * @param {string} config.mailer.username - Username to use to authenticate
 * @param {string} config.mailer.password - Password to use to authenticate
 * @param {string} config.mailer.mailSubject - The subject of the mail message that the mailer will send with the trading reports
 * @param {string} config.mailer.mailAddress - The mail address to send the reports to
 * @param {object} config.telegramBot - Telegram bot configuration
 * @param {string} config.telegramBot.apiKey - Telegram Bot API Key
 * @param {string} config.telegramBot.chat_id - Telegram Chat Id to send messages to
 * @param {object} config.binance - Binance Configuration
 * @param {string} config.binance.apiKey - Binance API Key
 * @param {string} config.binance.secretKey - Binance Secret Key
 * @param {number} config.timeRange - Bot Time Range to use ie: 5 -> 5 seconds or 60 -> 1 minute
 *@param {number} timeLimit Time in minutes of the time that should have passed to allow a signal of a symbol to be sent again
 *
 * @property {string} mailer for sending emails
 * @property {object} mail Contains details for sending mails
 * @property {string} mail.mailAddress Mail address that will be used for sending emails to
 * @property {string} mail.mailSubject Subject to assign to the mail. Like a title.
 * @property {object} telegramBot Bot for sending messages to groups or chats
 * @property {number} telegram_chat_id Chat Id where the messages will be send
 * @property {object} binance Configuration for connecting with the API
 * @property {number} timeRange to use when storing and calculating averages for the cyptocurrency pairs
 * @property {object} data where specific information of every pair is stored every second based in the timeRange range
 * @property {object} statuses Status Codes that prevents the bot from working properly
 * @property {boolean} canTrade Indicates if the bot can trade (The bot will check if it can or not by itself)
 * @property {boolean} isTrading Wether the bot is already in a trade
 * @property {boolean} isLoading Wether the bot is loading information from BINANCE API
 * @property {Array} trades Stores the last trades done by the bot or manually done in Binance Platforms
 *@property {object} balances Stores the account holder available balances (Read mode only)
 *@property {Array} pairs Stores the current available pairs to trade with
 *@property {number} timeLimit Time in minutes of the time that should have passed to allow a signal of a symbol to be sent again
 */
module.exports = class Bot {
  constructor(
    config = {
      mailer: {
        host: null,
        port: 465,
        useSSL: false,
        username: null,
        password: null,
        mailSubject: null,
        mailAddress: null,
      },
      telegramBot: {
        apiKey: null,
        chat_id: null,
      },
      binance: {
        apiKey: null,
        secretKey: null,
      },
      timeRange: 300,
      timeLimit: 10,
    }
  ) {
    try {
      this.mailer = m.createTransport({
        host: config.mailer.host,
        port: config.mailer.port,
        secure: config.mailer.useSSL,
        auth: {
          user: config.mailer.username,
          pass: config.mailer.password,
        },
      });
      this.mail = {
        from: config.mailer.username,
        mailAddress: config.mailer.mailAddress,
        mailSubject: config.mailer.mailSubject,
      };
      this.telegramBot = new t(config.telegramBot.apiKey);
      this.telegram_chat_id = config.telegramBot.chat_id;
      this.binance = config.binance;
      this.timeRange = config.timeRange;
      this.data = {};
      this.statuses = {
        400: "Bad Request. Something in the request is malformed",
        401: "Not Authorized",
        403: "WAF(Web Application Firewall) limit has been violated",
        429: "Request limit has been exceeded. Be careful.",
        418: "You are banned from using the Binance API for a while.",
      };
      this.canTrade = true;
      this.isTrading = false;
      this.isLoading = false;
      this.trades = [];
      this.balances = {};
      this.binanceWS = null;
      this.pairs = [];
      this.timeLimit = config.timeLimit;
    } catch (e) {
      throw e;
    }
  }
  /**
   * @function
   * @async
   * @memberof Bot
   * @name sendTelegram
   * @description Sends a message to a private/group chat
   * @param {string} body - Body of the message that will be send to the chat
   * @returns {void}
   */
  async sendTelegram(body) {
    try {
      await this.telegramBot.sendMessage(this.telegram_chat_id, body);
    } catch (e) {
      throw e;
    }
  }
  /**
   * @function
   * @async
   * @memberof Bot
   * @name sendMail
   * @description Sends an email to the specified address
   * @param {string} subject - Subject of the mail that will be shown to the user as title
   * @param {string} body - Body of the mail
   * @returns {void}
   */
  async sendMail(subject, body) {
    try {
      await this.mailer.sendMail({
        from: this.mail.from,
        to: this.mail.mailAddress,
        subject: subject,
        text: body,
      });
    } catch (e) {
      throw e;
    }
  }
  /**
   * @function
   * @memberof Bot
   * @name signPayload
   * @description generates the sha256 hex signed string to send along requests
   * @param {string} payload The querystrings that will be send along the request to the server
   * @returns {string} The sha256 signed string
   */
  signPayload(payload) {
    try {
      let signer = s.createHmac("sha256", this.binance.secretKey);
      signer.update(payload);
      let result = signer.digest("hex");
      return result;
    } catch (e) {
      throw e;
    }
  }
  /**
   * @function
   * @async
   * @memberof Bot
   * @name request
   * @description Generic function for every request to be made by the bot
   * @param {boolean} withAuthentication Wether the request needs to be authenticated against the Binance API
   *@param {string} requestMethod Wether the request is GET or POST
   *@param {string} url The url where the request is headed
   * @param {string} payload The querystrings that will be send along the request to the server
   * @returns {any} The response from the request
   */
  async request(withAuthentication, requestMethod, url, payload) {
    l(withAuthentication, requestMethod, url, payload);
    try {
      let { data, status } = await a.request({
        method: requestMethod,
        url: payload === null ? url : url + payload,
        headers: withAuthentication
          ? { "X-MBX-APIKEY": this.binance.apiKey }
          : {},
      });
      if (this.statuses.hasOwnProperty(status)) {
        throw new StatusCodeWarning(this.statuses[status]);
      }
      return data;
    } catch (e) {
      l(e);
      throw e;
    }
  }
  /**
   * @function
   * @async
   * @memberof Bot
   * @name getWorkingPairs
   * @description Retrieves from Binance API all the available pairs in the market, that aren't tokens like (UP,DOWN), that are spot trading allowed and the ones that have Tether (USDT) as quote
   * @returns {Array} The working pairs available
   */
  async getWorkingPairs() {
    try {
      let { symbols } = await this.request(
        false,
        "GET",
        API_URL + ENDPOINTS.exchangeInformation,
        null
      );
      let pairs = symbols
        .filter(
          (pair) =>
            pair.status === "TRADING" &&
            pair.quoteAsset === "USDT" &&
            pair.isSpotTradingAllowed === true &&
            pair.baseAsset.includes("UP") === false &&
            pair.baseAsset.includes("DOWN") === false
        )
        .map((pair) => ({
          symbol: pair.symbol.toLowerCase(),
          minimumQuantity: parseFloat(
            pair.filters.find((filter) => filter.filterType === "LOT_SIZE")
              .minQty
          ),
          maximumQuantity: parseFloat(
            pair.filters.find((filter) => filter.filterType === "LOT_SIZE")
              .maxQty
          ),
        }));
      return pairs;
    } catch (e) {
      throw e;
    }
  }
  /**
   * @function
   * @async
   * @memberof Bot
   * @name isServerOnMaintenance
   * @description Sends a request to Binance API to check if the servers are on maintenance
   * @returns {boolean} Wether the server is on maintenance
   */
  async isServerOnMaintenance() {
    try {
      let { status } = await this.request(
        false,
        "GET",
        API_URL + ENDPOINTS.systemStatus,
        null
      );
      if (status === 0) {
        this.canTrade = true;
        return false;
      }
      return true;
    } catch (e) {
      throw e;
    }
  }
  /**
   * @function
   * @async
   * @memberof Bot
   * @name processStream
   * @description Receives the stream from the websocket, parses the information, makes calculations and trades
   * @param {string} stream Stream of a market pair in string format
   * @returns {void}
   */
  async processStream(stream) {
    try {
      let { data } = JSON.parse(stream);
      let symbol = data.s;
      let baseAsset = symbol.replace("USDT", "");
      let quoteAsset = "USDT";
      let currentPrice = parseFloat(data.k.c);
      this.data[symbol].prices.push(currentPrice);
      let length = this.data[symbol].prices.length;
      if (this.balances.hasOwnProperty(baseAsset)) {
        this.balances[baseAsset].price = currentPrice;
        this.balances[baseAsset].value =
          currentPrice * this.balances[baseAsset].balance;
      }
      if (length > this.timeRange) {
        this.data[symbol].prices.shift();
        length = this.data[symbol].prices.length;
      }
      if (length === this.timeRange) {
        let averagePrice =
          this.data[symbol].prices.reduce((a, v) => a + v) / length;
        //Start
        let percentage = ((currentPrice - averagePrice) / averagePrice) * 100;
        let buy = percentage <= -1;
        let sell = percentage >= 1.5;
        if (
          (buy && this.balances.hasOwnProperty(quoteAsset)) ||
          (sell && this.balances.hasOwnProperty(baseAsset))
        ) {
          let balance = this.balances[buy ? quoteAsset : baseAsset].balance;
          let stepSize = this.pairs.find(pair=>pair.symbol===symbol.toLowerCase()).minimumQuantity;
          let quantity =
            balance / currentPrice - ((balance / currentPrice) % stepSize);
          if (this.canMakeTrade(symbol, buy ? "BUY" : "SELL", currentPrice)) {
            l("balance:",balance);
            l("currentPrice:",currentPrice);
            l("StepSize:",stepSize);
            l("Quantity:",quantity);
            let response = await this.trade({
              symbol: symbol,
              side: buy ? "BUY" : "SELL",
              type: "LIMIT",
              timeInForce: "GTC",
              quantity: buy ? quantity : balance,
              price: currentPrice.toPrecision(8),
            });
            this.printSignal(
              symbol,
              buy,
              sell,
              currentPrice,
              averagePrice,
              percentage
            );
            if (buy) {
              this.data[symbol].lastBuyPrice = currentPrice;
            }
            l(response);
            await this.reLoad();
          }
          // if ((Date.now() - this.data[symbol].lastSignalTimestamp) / 100 / 60) {
          // }
        }
        //End
      }
    } catch (e) {
      this.binanceWS.close();
      l(e.message);
    }
  }
  /**
   * @function
   * @async
   * @memberof Bot
   * @name printSignal
   * @description Prints the signal
   * @param {string} symbol Symbol of the pairs
   * @param {boolean} buy Buy statement
   * @param {boolean} sell Sell statement
   * @param {number} currentPrice Current symbol price
   * @param {number} averagePrice Average symbol price for the last {timeInRange}minutes
   * @param {number} percentage Percentage of the signal.
   * @returns {void}
   */
  printSignal(symbol, buy, sell, currentPrice, averagePrice, percentage) {
    l(c.magenta("............................"));
    l("Symbol:", symbol);
    l(buy ? c.green("BUY") : sell ? c.red("SELL") : c.white("NONE"));
    l("Current Price:", c.yellow(`$${currentPrice.toPrecision(8)}`));
    l("Average Price:", c.yellow(`$${averagePrice.toPrecision(8)}`));
    l("Change Percentage:", c.yellow(`${percentage.toFixed(2)}%`));
    l(c.magenta("............................"));
  }
  /**
   * @function
   * @async
   * @memberof Bot
   * @name getAccountBalances
   * @description Retrieves the account holder balances (Read Only mode) from Binance
   * @returns {object} The balances of the account holder
   */
  async getAccountBalances() {
    try {
      let querystrings = `timestamp=${Date.now()}`;
      let payload = `?${querystrings}&signature=${this.signPayload(
        querystrings
      )}`;
      let { balances } = await this.request(
        true,
        "GET",
        API_URL + ENDPOINTS.accountInformation,
        payload
      );
      let response = {};
      let result = balances.filter(
        (balance) =>
          parseFloat(balance.free) > 0 &&
          this.pairs.find(
            (symbol) =>
              symbol.symbol.toUpperCase().replace("USDT", "") === balance.asset
          ) !== undefined
      );
      result.forEach((balance) => {
        response[balance.asset] = {
          balance: parseFloat(balance.free),
          price: 0,
          value: 0,
        };
      });
      if (balances.find((balance) => balance.asset === "USDT") !== undefined) {
        let value = parseFloat(
          balances.find((balance) => balance.asset === "USDT").free
        );
        response["USDT"] = {
          balance: value,
          price: 1,
          value: value,
        };
      }
      return response;
    } catch (e) {
      l(e);
      throw e;
    }
  }
  /**
   * @function
   * @async
   * @memberof Bot
   * @name trade
   * @description Makes a trade on Binance Market
   * @property {string} symbol
   * @property {string} side
   * @property {string} type
   * @property {string} timeInForce
   * @property {number} quantity
   * @property {number} price
   * @returns {void}
   */
  async trade({
    symbol,
    side,
    type = "LIMIT",
    timeInForce = "GTC",
    quantity,
    price,
  }) {
    try {
      let querystrings = `symbol=${symbol}&side=${side}&type=${type}&timeInForce=${timeInForce}&quantity=${quantity}&price=${price}&newOrderRespType=RESULT&timestamp=${Date.now()}`;
      let payload = `?${querystrings}&signature=${this.signPayload(
        querystrings
      )}`;
      let response = await this.request(
        true,
        "POST",
        API_URL + ENDPOINTS.trade,
        payload
      );
      l(response);
    } catch (e) {
      throw e;
    }
  }
  /**
   * @function
   * @async
   * @memberof Bot
   * @name canMakeTrade
   * @description Checks wether the user have enough balance to trade and if it is not already trading/loading or banned by Binance rate limits
   * @param {string} symbol Pair to check
   * @param {string} side Wether it is a buy or sell trade
   * @param {number} currentPrice The actual price in the market
   * @returns {Boolean} Wether it can make a trade
   */
  canMakeTrade(symbol, side, currentPrice) {
    try {
      if (
        this.canTrade &&
        this.isLoading === false &&
        this.isTrading === false &&
        this.balances.hasOwnProperty(symbol.replace("USDT", ""))
      ) {
        switch (side) {
          case "BUY":
            if (this.balances.hasOwnProperty("USDT")) {
              return this.balances["USDT"].value >= 10 ? true : false;
            }
            return false;
          case "SELL":
            return this.balances[symbol.replace("USDT", "")].value >= 10 &&
              this.data[symbol].lastBuyPrice > currentPrice
              ? true
              : false;
        }
      }
      return false;
    } catch (e) {
      throw e;
    }
  }
  /**
   * @function
   * @async
   * @memberof Bot
   * @name reLoad
   * @description Reloads the bot inner data.
   * @returns {void}
   */
  async reLoad() {
    try {
      let maintenance = await this.isServerOnMaintenance();
      if (maintenance === false) {
        this.isLoading = true;
        this.canTrade = false;
        this.pairs = await this.getWorkingPairs();
        if (this.pairs.length === 0) {
          throw new NoPairsInMarket(
            "Unfortunely no market pairs are available at this time, try again in 1 hour."
          );
        }
        this.balances = await this.getAccountBalances();
        if (this.balances.length === 0) {
          throw new NoBalancesAvailable(
            "You have no balances in your account, to use the trader bot you need at least 1 balance worth $10"
          );
        }
        this.isLoading = false;
        this.canTrade = true;
        l(this.data);
      } else {
        throw new MaintenanceMode("Unfortunely server is on maintenance");
      }
    } catch (e) {
      throw e;
    }
  }
  /**
   * @function
   * @async
   * @memberof Bot
   * @name initializeBot
   * @description Main and only function that should be called from this class. Starts and checks everything that the bot requires to work properly.
   * @returns {void}
   */
  async initializeBot() {
    try {
      await this.reLoad();
      this.pairs.forEach((pair) => {
        this.data[pair.symbol.toUpperCase()] = {
          prices: [],
          lastBuyPrice: 0,
          lastSignalTimestamp: Date.now(),
        };
      });
      this.binanceWS = new ws(
        `${WS_URL}/stream?streams=${this.pairs
          .map((symbol) => symbol.symbol)
          .join("@kline_1m/")}`
      );
      this.binanceWS.on("message", async (data) => this.processStream(data));
      await this.sendTelegram("Bot v.4 has been started");
      await this.sendMail(
        "Bot has been started",
        "Initial balances:\n" + JSON.stringify(this.balances)
      );
    } catch (e) {
      l(e);
    }
  }
};
