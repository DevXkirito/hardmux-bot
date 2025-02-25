const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch"); // Ensure this is installed: npm install node-fetch
const { UserSession } = require("./database");

const downloadDir = "./downloads"; // Directory for storing files

async function saveFile(bot, message, fileType) {
    const chatId = message.chat.id;
    const fileId = message.document ? message.document.file_id : message.video?.file_id;
    const fileName = message.document ? message.document.file_name : `${Date.now()}.mp4`;

    if (!fileId) {
        return "❌ No valid file found.";
    }

    const filePath = path.join(downloadDir, fileName);
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;

    try {
        const response = await fetch(fileUrl);
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));

        if (fileType === "video") {
            await UserSession.findOneAndUpdate(
                { chatId },
                { videoPath: filePath, filename: fileName },
                { upsert: true }
            );
            return "✅ Video saved! Now send a subtitle file.";
        } else if (fileType === "subtitle") {
            await UserSession.findOneAndUpdate(
                { chatId },
                { subtitlePath: filePath },
                { upsert: true }
            );
            return "✅ Subtitle saved! Now press **Start Hardmux**.";
        } else {
            return "❌ Unsupported file type.";
        }
    } catch (error) {
        console.error("File download error:", error);
        return "❌ Error downloading file. Please try again.";
    }
}

module.exports = { saveFile };
