require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const mongoose = require("mongoose");

// Load environment variables
const mongoURI = process.env.MONGODB_URI;
const token = process.env.TELEGRAM_BOT_TOKEN;

// Connect to MongoDB
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    directConnection: true,
}).then(() => {
    console.log("✅ Connected to MongoDB successfully!");
}).catch((err) => {
    console.error("❌ MongoDB Connection Error:", err.message);
    process.exit(1); // Exit process if MongoDB fails to connect
});

const userSchema = new mongoose.Schema({
    chatId: Number,
    videoPath: String,
    subtitlePath: String,
    logoPath: String,
    preset: String,
});

const UserSession = mongoose.model("UserSession", userSchema);

const bot = new TelegramBot(token, { polling: true });

const tempDir = path.join(__dirname, "temp");
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Command to start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Send a video or document to add subtitles and a logo.");
});

// Handle Video and Document Uploads
bot.on("video", (msg) => handleFileUpload(msg, "video"));
bot.on("document", (msg) => handleFileUpload(msg, "document"));

async function handleFileUpload(msg, type) {
    const chatId = msg.chat.id;
    const fileId = type === "video" ? msg.video.file_id : msg.document.file_id;
    const filePath = await bot.getFile(fileId);
    const downloadLink = `https://api.telegram.org/file/bot${token}/${filePath.file_path}`;

    const fileName = type === "video" ? `input_${Date.now()}.mp4` : msg.document.file_name;
    const savePath = path.join(tempDir, fileName);
    await downloadFile(downloadLink, savePath, chatId);

    await UserSession.findOneAndUpdate({ chatId }, { videoPath: savePath }, { upsert: true });

    bot.sendMessage(chatId, "Now send a subtitle file (.srt or .ass)");
}

// Handle Subtitle Upload
bot.on("document", async (msg) => {
    const chatId = msg.chat.id;
    const session = await UserSession.findOne({ chatId });
    if (!session || !session.videoPath) return;

    const fileName = msg.document.file_name;
    if (!fileName.endsWith(".srt") && !fileName.endsWith(".ass")) {
        bot.sendMessage(chatId, "Invalid subtitle file. Please send a .srt or .ass file.");
        return;
    }

    const filePath = await bot.getFile(msg.document.file_id);
    const downloadLink = `https://api.telegram.org/file/bot${token}/${filePath.file_path}`;
    const savePath = path.join(tempDir, fileName);
    await downloadFile(downloadLink, savePath, chatId);

    await UserSession.findOneAndUpdate({ chatId }, { subtitlePath: savePath });

    bot.sendMessage(chatId, "Now send a logo (image or file)");
});

// Handle Logo Upload
bot.on("photo", async (msg) => handleLogoUpload(msg, msg.photo[msg.photo.length - 1].file_id));
bot.on("document", async (msg) => handleLogoUpload(msg, msg.document.file_id));

async function handleLogoUpload(msg, fileId) {
    const chatId = msg.chat.id;
    const session = await UserSession.findOne({ chatId });
    if (!session || !session.subtitlePath) return;

    const filePath = await bot.getFile(fileId);
    const downloadLink = `https://api.telegram.org/file/bot${token}/${filePath.file_path}`;
    const savePath = path.join(tempDir, `logo_${Date.now()}.png`);

    await downloadFile(downloadLink, savePath, chatId);
    await UserSession.findOneAndUpdate({ chatId }, { logoPath: savePath });

    // Ask user for preset options
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: "Slow", callback_data: "preset_slow" }],
                [{ text: "Fast", callback_data: "preset_fast" }],
                [{ text: "Very Fast", callback_data: "preset_veryfast" }],
                [{ text: "Proceed with Video", callback_data: "process_video" }],
            ],
        },
    };

    bot.sendMessage(chatId, "Choose encoding preset:", options);
}

// Handle Preset Selection
bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id;
    if (query.data.startsWith("preset_")) {
        const preset = query.data.split("_")[1];
        await UserSession.findOneAndUpdate({ chatId }, { preset });

        bot.editMessageText(`Preset set to: ${preset}`, {
            chat_id: chatId,
            message_id: query.message.message_id,
        });
    } else if (query.data === "process_video") {
        processVideo(chatId);
    }
});

// Function to Process Video
async function processVideo(chatId) {
    const session = await UserSession.findOne({ chatId });
    if (!session || !session.videoPath || !session.subtitlePath || !session.logoPath) {
        bot.sendMessage(chatId, "Missing required files. Please start again.");
        return;
    }

    const outputPath = path.join(tempDir, `output_${Date.now()}.mp4`);
    const preset = session.preset || "slow";

    bot.sendMessage(chatId, "Processing video... This may take some time.");

    ffmpeg()
        .input(session.videoPath)
        .input(session.logoPath)
        .input(session.subtitlePath)
        .complexFilter([
            `[1][0]scale2ref=w=iw/5:h=ow/mdar[logo][video]`,
            `[video][logo]overlay=W-w-10:10`,
            `subtitles='${path.resolve(session.subtitlePath)}'`,
            `scale=1280:720`,
        ])
        .outputOptions([
            `-c:v libx264`,
            `-preset ${preset}`,
            `-crf 23`,
            `-r 23.976`,
            `-b:v 2000k`,
            `-b:a 192k`,
        ])
        .output(outputPath)
        .on("end", async () => {
            bot.sendVideo(chatId, fs.createReadStream(outputPath));
            await UserSession.deleteOne({ chatId });
            fs.unlinkSync(outputPath);
        })
        .on("error", (err) => {
            bot.sendMessage(chatId, "Error processing video.");
            console.error(err);
        })
        .run();
}

// Function to Download Files
async function downloadFile(url, savePath, chatId) {
    const response = await fetch(url);
    const fileStream = fs.createWriteStream(savePath);
    response.body.pipe(fileStream);

    return new Promise((resolve, reject) => {
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
    });
}

console.log("✅ Bot is running...");
