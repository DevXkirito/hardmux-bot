const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch"); // Install using: npm install node-fetch
const { UserSession } = require("./database");

const downloadDir = "./downloads"; // Directory for storing files

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

// Function to show progress bar
async function updateProgress(current, total, message, startTime, bot, chatId, progressMessage) {
    const now = Date.now();
    const elapsedTime = now - startTime;
    const speed = current / (elapsedTime / 1000); // Speed in bytes per second
    const eta = total > current ? ((total - current) / speed) * 1000 : 0;

    const percentage = (current * 100) / total;
    const progress = `[${"◼️".repeat(Math.floor(percentage / 5))}${"◻️".repeat(20 - Math.floor(percentage / 5))}]`;
    const progressText = `${progress}\n🔹 Progress: ${percentage.toFixed(2)}%\n🔹 Speed: ${humanBytes(speed)}/s\n🔹 ETA: ${timeFormatter(eta)}`;

    try {
        await bot.editMessageText(`📥 Downloading...\n${progressText}`, {
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
        let lastUpdate = Date.now();

        const fileStream = fs.createWriteStream(filePath);
        const stream = response.body;

        stream.on("data", async (chunk) => {
            downloadedSize += chunk.length;
            fileStream.write(chunk);

            const now = Date.now();
            if (now - lastUpdate >= 10000) { // Update progress every 10 seconds
                await updateProgress(downloadedSize, totalSize, progressMessage, startTime, bot, chatId, progressMessage);
                lastUpdate = now;
            }
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
            await UserSession.findOneAndUpdate(
                { chatId },
                { videoPath: filePath, filename: fileName },
                { upsert: true }
            );
            successMessage = "✅ Video saved! Now send a subtitle file.";
        } else if (fileType === "subtitle") {
            await UserSession.findOneAndUpdate(
                { chatId },
                { subtitlePath: filePath },
                { upsert: true }
            );
            successMessage = "✅ Subtitle saved! Now press **Start Hardmux**.";
        } else {
            successMessage = "❌ Unsupported file type.";
        }

        return successMessage;
    } catch (error) {
        console.error("File download error:", error);
        return "❌ Error downloading file. Please try again.";
    }
}

module.exports = { saveFile };
