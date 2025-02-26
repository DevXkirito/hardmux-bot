require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { saveFile } = require("./fileHandler");
const { hardmux } = require("./muxing");
const { connectDB } = require("./database");

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
connectDB();

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    if (msg.document || msg.video) {
        const fileType = msg.document ? (msg.document.file_name.endsWith(".srt") || msg.document.file_name.endsWith(".ass") ? "subtitle" : "video") : "video";
        const response = await saveFile(bot, msg, fileType);
        bot.sendMessage(chatId, response.message || response, response.showButton ? { reply_markup: { inline_keyboard: [[{ text: "Encode", callback_data: "start_hardmux" }]] } } : {});
    }
});

bot.on("callback_query", async (callbackQuery) => {
    await hardmux(bot, callbackQuery.message.chat.id);
});

bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "Welcome! Send a video and subtitle file to begin."));
