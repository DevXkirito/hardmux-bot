const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { UserSession } = require("./database");

const FONT_PATH = path.join(__dirname, "fonts", "HelveticaRounded-Bold.ttf");

async function hardmux(bot, chatId, messageId) {
    const user = await UserSession.findOne({ chatId });

    if (!user || !user.videoPath || !user.subtitlePath) {
        bot.sendMessage(chatId, "❌ You need to send both a video and subtitle file first.");
        return;
    }

    const videoPath = user.videoPath;
    const subtitlePath = user.subtitlePath;
    const outputPath = `./downloads/${chatId}_hardmux.mp4`;

    if (!fs.existsSync(FONT_PATH)) {
        bot.sendMessage(chatId, `❌ Font file not found at ${FONT_PATH}.`);
        return;
    }

    const ffmpegArgs = [
        "-i", videoPath,
        "-vf", `subtitles='${subtitlePath}':force_style='FontName=${FONT_PATH},FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1,Shadow=1'`,
        "-c:v", "libx264",
        "-preset", "Veryfast",
        "-crf", "23",
        "-c:a", "copy",
        outputPath
    ];

    // Delete the previous message after clicking "Start Hardmux"
    bot.deleteMessage(chatId, messageId).catch(console.error);

    // Send a message to be updated later
    let progressMessage = await bot.sendMessage(chatId, "🔄 Hardmuxing your video... Please wait.");

    const ffmpegProcess = spawn("ffmpeg", ffmpegArgs);

    let lastUpdate = Date.now();

    ffmpegProcess.stderr.on("data", (data) => {
        const progress = data.toString();
        if (progress.includes("frame=")) {
            const now = Date.now();
            if (now - lastUpdate >= 10000) { // Update every 10 seconds
                bot.editMessageText(`⏳ Encoding in progress...`, {
                    chat_id: chatId,
                    message_id: progressMessage.message_id,
                }).catch(console.error);
                lastUpdate = now;
            }
        }
    });

    ffmpegProcess.on("close", async (code) => {
        if (code !== 0) {
            bot.editMessageText("❌ Hardmuxing failed.", {
                chat_id: chatId,
                message_id: progressMessage.message_id,
            });
            return;
        }

        bot.editMessageText("✅ Hardmux completed! Uploading the file...", {
            chat_id: chatId,
            message_id: progressMessage.message_id,
        });

        await bot.sendVideo(chatId, outputPath, { caption: "🎬 Here is your hardmuxed video with styled subtitles!" });
    });
}

module.exports = { hardmux };
