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

    // FFmpeg command with font styling for subtitles
    const ffmpegCmd = `ffmpeg -i "${videoPath}" -vf "subtitles='${subtitlePath}':force_style='FontName=HelveticaRounded-Bold,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1,Shadow=1'" -c:v libx264 -preset slow -crf 23 -c:a copy "${outputPath}"`;

    bot.sendMessage(chatId, "🔄 Hardmuxing your video... This may take some time.");

    exec(ffmpegCmd, (error, stdout, stderr) => {
        if (error) {
            bot.sendMessage(chatId, `❌ Error occurred: ${error.message}`);
            return;
        }

        bot.sendMessage(chatId, "✅ Hardmux completed! Uploading the file...");
        bot.sendVideo(chatId, outputPath, { caption: "🎬 Here is your hardmuxed video with styled subtitles!" });
    });
}

module.exports = { hardmux };
