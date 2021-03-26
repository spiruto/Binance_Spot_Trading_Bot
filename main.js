const Bot = require("./bot.class");
const b = new Bot({
    binance: {
        apiKey: "",
        secretKey: ""
    },
    telegramBot: {
        apiKey: "",
        chat_id: 0
    },
    mailer: {
        mailAddress: "",
        mailSubject: "",
        host: "",
        port: 465,
        useSSL: true,
        username: "",
        password: ""
    },
    timeRange:30
});
b.initializeBot();
