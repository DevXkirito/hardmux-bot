const { exec } = require("child_process");
const path = require("path");
const { UserSession } = require("./database");

const FONT_PATH = path.join(__dirname, "fonts", "HelveticaRounded-Bold.ttf");

async function hardmux(bot, chatId) {
    const user = await UserSession.findOne({ chatId });

    if (!user || !user.videoPath || !user.subtitlePath) {
        bot.sendMessage(chatId, "❌ You need to send both a video and subtitle file first.");
        return;
    }

    const videoPath = user.videoPath;
    const subtitlePath = user.subtitlePath;
    const outputPath = `./downloads/${chatId}_hardmux.mp4`;

    // FFmpeg command with proper font path
    const ffmpegCmd = `ffmpeg -i "${videoPath}" -vf "subtitles='${subtitlePath}':fontsdir='${path.dirname(FONT_PATH)}':force_style='FontName=HelveticaRounded-Bold,FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1,Shadow=1'" -c:v libx264 -preset veryfast -crf 23 -c:a copy -y "${outputPath}"`;

    // Send initial progress message
    let progressMessage = await bot.sendMessage(chatId, "🔄 Hardmuxing your video...");

    const process = exec(ffmpegCmd);

    process.stdout.on("data", (data) => console.log(data));
    process.stderr.on("data", (data) => console.log(data));

    let startTime = Date.now();

    const interval = setInterval(async () => {
        const elapsedTime = Math.floor((Date.now() - startTime) / 1000);
        const progressText = `🔄 Encoding in progress...\n⏳ Time elapsed: ${elapsedTime}s`;

        try {
            await bot.editMessageText(progressText, {
                chat_id: chatId,
                message_id: progressMessage.message_id,
            });
        } catch (error) {
            console.error("Error updating progress message:", error);
        }
    }, 10000); // Update every 10 seconds

    process.on("exit", async (code) => {
        clearInterval(interval);

        if (code === 0) {
            await bot.editMessageText("✅ Hardmux completed! Uploading the file...", {
                chat_id: chatId,
                message_id: progressMessage.message_id,
            });

            await bot.sendVideo(chatId, outputPath, { caption: "🎬 Here is your hardmuxed video with styled subtitles!" });
        } else {
            await bot.editMessageText("❌ Error during encoding.", {
                chat_id: chatId,
                message_id: progressMessage.message_id,
            });
        }
    });
}

module.exports = { hardmux };
