require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const { saveFile } = require("./fileHandler");
const { hardmux } = require("./muxing");
const { connectDB } = require("./database");

const BOT_TOKEN = process.env.BOT_TOKEN || "6040076450:AAF0twbToR3IBCpuSFXQqqVSmQlcYNe_kbA"; // Avoid hardcoding tokens
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Connect to MongoDB
connectDB();

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

    if (msg.document || msg.video) {
        try {
            const fileType = msg.document ? (msg.document.mime_type.includes("video") ? "video" : "subtitle") : "video";
            const response = await saveFile(bot, msg, fileType);

            if (typeof response === "object" && response.showButton) {
                const options = {
                    reply_markup: {
                        inline_keyboard: [[{ text: "Encode", callback_data: "start_hardmux" }]],
                    },
                };
                bot.sendMessage(chatId, response.message, options);
            } else {
                bot.sendMessage(chatId, response);
            }
        } catch (error) {
            console.error("❌ Error handling file:", error);
            bot.sendMessage(chatId, "❌ An error occurred while processing your file. Please try again.");
        }
    }
});

bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;

    if (callbackQuery.data === "start_hardmux") {
        try {
            await hardmux(bot, chatId);
        } catch (error) {
            console.error("❌ Hardmux Error:", error);
            bot.sendMessage(chatId, "❌ An error occurred while muxing your video. Please try again.");
        }
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Welcome! Send a video and a subtitle file to begin muxing.");
});
