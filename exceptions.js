/**
 *@class 
 *@name StatusCodeWarning
 *@description Creates a new error based on the request status code
 *@param {string} m  Message to show to the user when this error fires
 */
class StatusCodeWarning extends Error {
    constructor(m) {
        super(m);
    }
}
/**
 *@class 
 *@name MaintenanceMode
 *@description Creates a new error for when the Binance API is on maintenance mode
 *@param {string} m  Message to show to the user when this error fires
 */
class MaintenanceMode extends Error {
    constructor(m) {
        super(`Binance servers are on maintenance, please wait a couple of hours and try again..\n${m}`);
    }
}
/**
 *@class 
 *@name TelegramBotError
 *@description Creates a new error for when the Telegram Bot failes somehow
 *@param {string} m  Message to show to the user when this error fires
 */
class TelegramBotError extends Error {
    constructor(m) {
        super(`Something happened with your telegram bot.\n${m}`);
    }
}
/**
 *@class 
 *@name MailerError
 *@description Creates a new error for when the mailer cannot work properly
 *@param {string} m  Message to show to the user when this error fires
 */
class MailerError extends Error {
    constructor(m) {
        super(`Could not sent any mail, please check your mailer configuration and try again...\n${m}`);
    }
}
/**
 *@class 
 *@name NoPairsInMarket
 *@description Creates a new error for when there are no pairs to work with, in the market
 *@param {string} m  Message to show to the user when this error fires
 */
class NoPairsInMarket extends Error {
    constructor(m) {
        super(`Seems like market is empty...\n${m}`);
    }
}
/**
 *@class 
 *@name NoBalancesAvailable
 *@description Creates a new error for when the account holder has no balances at all
 *@param {string} m  Message to show to the user when this error fires
 */
 class NoBalancesAvailable extends Error {
    constructor(m) {
        super(`Seems like your balance is empty...\n${m}`);
    }
}
module.exports = { MaintenanceMode, TelegramBotError, MailerError, StatusCodeWarning, NoPairsInMarket,NoBalancesAvailable };