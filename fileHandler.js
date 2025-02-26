const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { UserSession } = require("./database");

const downloadDir = "./downloads"; // Folder to save files

// Format bytes
function humanBytes(size) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return `${size.toFixed(2)} ${units[i]}`;
}

// Time formatter
function timeFormatter(ms) {
    const sec = Math.floor(ms / 1000);
    const min = Math.floor(sec / 60);
    const hr = Math.floor(min / 60);
    return (hr ? `${hr}h ` : "") + (min % 60 ? `${min % 60}m ` : "") + `${sec % 60}s`;
}

// Download file with progress
async function saveFile(bot, msg, fileType) {
    const chatId = msg.chat.id;
    const fileId = msg.document ? msg.document.file_id : msg.video?.file_id;
    const fileName = msg.document ? msg.document.file_name : `${Date.now()}.mp4`;
    if (!fileId) return "❌ No valid file found.";

    const filePath = path.join(downloadDir, fileName);
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;

    let progressMessage = await bot.sendMessage(chatId, "📥 Downloading file...");

    try {
        const response = await fetch(fileUrl);
        const totalSize = Number(response.headers.get("content-length"));
        let downloadedSize = 0;
        const startTime = Date.now();
        let lastUpdate = Date.now();

        const fileStream = fs.createWriteStream(filePath);
        const stream = response.body;

        stream.on("data", async (chunk) => {
            downloadedSize += chunk.length;
            fileStream.write(chunk);
            if (Date.now() - lastUpdate >= 5000) {
                await bot.editMessageText(`📥 Downloading...\n${humanBytes(downloadedSize)} / ${humanBytes(totalSize)}`, {
                    chat_id: chatId,
                    message_id: progressMessage.message_id,
                });
                lastUpdate = Date.now();
            }
        });

        await new Promise((resolve, reject) => {
            stream.on("end", resolve);
            stream.on("error", reject);
        });

        fileStream.end();
        await bot.deleteMessage(chatId, progressMessage.message_id).catch(console.error);

        await UserSession.findOneAndUpdate({ chatId }, fileType === "video" ? { videoPath: filePath } : { subtitlePath: filePath }, { upsert: true });

        const user = await UserSession.findOne({ chatId });
        if (user.videoPath && user.subtitlePath) {
            return { message: "✅ Both files received! Press **Encode** to start.", showButton: true };
        }
        return `✅ ${fileType.charAt(0).toUpperCase() + fileType.slice(1)} saved! Now send the ${fileType === "video" ? "subtitle" : "video"} file.`;

    } catch (error) {
        console.error("Download error:", error);
        return "❌ Error downloading file.";
    }
}

module.exports = { saveFile };
