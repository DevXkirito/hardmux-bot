const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch"); // Install using: npm install node-fetch
const { UserSession } = require("./database");

const downloadDir = "./downloads";

// Function to format bytes into readable format
function humanBytes(size) {
    const units = ["B", "KiB", "MiB", "GiB", "TiB"];
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return `${size.toFixed(2)} ${units[i]}`;
}

// Function to format time
function timeFormatter(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return (hours ? `${hours}h ` : "") + (minutes % 60 ? `${minutes % 60}m ` : "") + `${seconds % 60}s`;
}

// Function to update progress bar
async function updateProgress(current, total, bot, chatId, progressMessage) {
    const percentage = (current * 100) / total;
    const progress = `[${"◼️".repeat(Math.floor(percentage / 5))}${"◻️".repeat(20 - Math.floor(percentage / 5))}]`;
    const progressText = `📥 Downloading...\n${progress}\n🔹 Progress: ${percentage.toFixed(2)}%`;

    try {
        await bot.editMessageText(progressText, {
            chat_id: chatId,
            message_id: progressMessage.message_id,
        });
    } catch (error) {
        console.error("Failed to edit progress message:", error);
    }
}

// Function to download file with progress
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

    // Send initial progress message
    let progressMessage = await bot.sendMessage(chatId, "📥 Downloading file...");

    try {
        const response = await fetch(fileUrl);
        const totalSize = Number(response.headers.get("content-length"));
        let downloadedSize = 0;
        const startTime = Date.now();

        const fileStream = fs.createWriteStream(filePath);
        const stream = response.body;

        stream.on("data", async (chunk) => {
            downloadedSize += chunk.length;
            fileStream.write(chunk);
            await updateProgress(downloadedSize, totalSize, bot, chatId, progressMessage);
        });

        await new Promise((resolve, reject) => {
            stream.on("end", resolve);
            stream.on("error", reject);
        });

        fileStream.end();

        // Delete progress message
        await bot.deleteMessage(chatId, progressMessage.message_id).catch(console.error);

        let successMessage = "";
        if (fileType === "video") {
            await UserSession.findOneAndUpdate({ chatId }, { videoPath: filePath, filename: fileName }, { upsert: true });
            successMessage = "✅ Video saved! Now send a subtitle file.";
        } else if (fileType === "subtitle") {
            await UserSession.findOneAndUpdate({ chatId }, { subtitlePath: filePath }, { upsert: true });
            successMessage = "✅ Subtitle saved! Now press **Start Hardmux**.";

            // Send Inline Button
            await bot.sendMessage(chatId, successMessage, {
                reply_markup: {
                    inline_keyboard: [[{ text: "🚀 Start Hardmux", callback_data: "start_hardmux" }]],
                },
            });

            return;
        } else {
            successMessage = "❌ Unsupported file type.";
        }

        await bot.sendMessage(chatId, successMessage);
    } catch (error) {
        console.error("File download error:", error);
        await bot.sendMessage(chatId, "❌ Error downloading file. Please try again.");
    }
}

module.exports = { saveFile };
