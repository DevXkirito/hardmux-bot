const TelegramBot = require("node-telegram-bot-api");
const { saveFile } = require("./fileHandler");
const { hardmux } = require("./muxing");
const { connectDB } = require("./database");

const bot = new TelegramBot("6040076450:AAF0twbToR3IBCpuSFXQqqVSmQlcYNe_kbA", { polling: true });

connectDB();

bot.on("message", async (msg) => {
    const chatId = msg.chat.id;

    if (msg.document || msg.video) {
        const fileType = msg.document ? (msg.document.mime_type.includes("video") ? "video" : "subtitle") : "video";
        const response = await saveFile(bot, msg, fileType);

        if (typeof response === "object" && response.showButton) {
            const options = {
                reply_markup: {
                    inline_keyboard: [[{ text: "▶️ Start Hardmux", callback_data: "start_hardmux" }]],
                },
            };
            bot.sendMessage(chatId, response.message, options);
        } else {
            bot.sendMessage(chatId, response);
        }
    }
});

bot.on("callback_query", async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;

    if (callbackQuery.data === "start_hardmux") {
        await hardmux(bot, chatId);
    }
});

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Welcome! Send a video and a subtitle file to begin muxing.");
})
