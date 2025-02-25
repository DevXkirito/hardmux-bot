const TelegramBot = require('node-telegram-bot-api');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');
const cliProgress = require('cli-progress');

// Replace with your bot token
const token = '6040076450:AAE1R9oM7QmtwBbnURhzLZ2GeYTayI7EkmY';
const bot = new TelegramBot(token, { polling: true });

// Temporary storage for files
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Font path
const fontPath = path.join(__dirname, 'fonts', 'HelveticaRounded-Bold.ttf');

// Default encoding settings
let resolution = '1280:720';
let encoding = 'x264';
let crf = 23;
let preset = 'slow';

// Store user files
const userFiles = {};

// Function to download files with progress bar
async function downloadFile(url, dest, chatId, type) {
    const response = await fetch(url);
    const fileSize = parseInt(response.headers.get('content-length'), 10);
    const fileStream = fs.createWriteStream(dest);
    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

    let downloaded = 0;
    response.body.on('data', (chunk) => {
        downloaded += chunk.length;
        progressBar.update((downloaded / fileSize) * 100);
    });

    response.body.pipe(fileStream);
    progressBar.start(100, 0);

    return new Promise((resolve, reject) => {
        fileStream.on('finish', () => {
            progressBar.stop();
            bot.sendMessage(chatId, `${type} downloaded successfully.`);
            resolve();
        });
        fileStream.on('error', reject);
    });
}

// Handle /start command
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Welcome! Send a video file (MKV/MP4) to begin.');
});

// Handle video files
bot.on('video', async (msg) => {
    const chatId = msg.chat.id;
    const fileId = msg.video.file_id;
    const filePath = await bot.getFile(fileId);
    const downloadLink = `https://api.telegram.org/file/bot${token}/${filePath.file_path}`;
    const videoPath = path.join(tempDir, `video_${chatId}.mp4`);

    bot.sendMessage(chatId, 'Downloading video...');
    await downloadFile(downloadLink, videoPath, chatId, 'Video');
    userFiles[chatId] = { videoPath };

    bot.sendMessage(chatId, 'Video received. Now, send the subtitle file (SRT/ASS).');
});

// Handle subtitle files
bot.on('document', async (msg) => {
    const chatId = msg.chat.id;
    const fileName = msg.document.file_name;
    const fileId = msg.document.file_id;

    if (!userFiles[chatId]?.videoPath) {
        return bot.sendMessage(chatId, 'Please send a video file first.');
    }

    if (!fileName.endsWith('.srt') && !fileName.endsWith('.ass')) {
        return bot.sendMessage(chatId, 'Invalid subtitle format. Please send an SRT or ASS file.');
    }

    const filePath = await bot.getFile(fileId);
    const downloadLink = `https://api.telegram.org/file/bot${token}/${filePath.file_path}`;
    const subPath = path.join(tempDir, `subtitle_${chatId}.${fileName.split('.').pop()}`);

    bot.sendMessage(chatId, 'Downloading subtitle...');
    await downloadFile(downloadLink, subPath, chatId, 'Subtitle');
    userFiles[chatId].subPath = subPath;

    bot.sendMessage(chatId, 'Subtitle received. Now, send the logo file (PNG/JPG).');
});

// Handle logo files
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    if (!userFiles[chatId]?.subPath) {
        return bot.sendMessage(chatId, 'Please send a subtitle file first.');
    }

    const fileId = msg.photo[msg.photo.length - 1].file_id;
    const filePath = await bot.getFile(fileId);
    const downloadLink = `https://api.telegram.org/file/bot${token}/${filePath.file_path}`;
    const logoPath = path.join(tempDir, `logo_${chatId}.png`);

    bot.sendMessage(chatId, 'Downloading logo...');
    await downloadFile(downloadLink, logoPath, chatId, 'Logo');
    userFiles[chatId].logoPath = logoPath;

    // Display options
    const options = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Set Resolution', callback_data: 'set_resolution' }],
                [{ text: 'Set CRF', callback_data: 'set_crf' }],
                [{ text: 'Set Encoding', callback_data: 'set_encoding' }],
                [{ text: 'Set Preset (Slow/Fast/VeryFast)', callback_data: 'set_preset' }],
                [{ text: 'Process Video', callback_data: 'process_video' }]
            ]
        }
    };

    bot.sendMessage(chatId, 'All files received. Choose an option:', options);
});

// Handle inline button selections
bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'set_resolution') {
        bot.sendMessage(chatId, 'Enter resolution (e.g., 1280:720):');
        bot.once('message', (msg) => {
            resolution = msg.text;
            bot.sendMessage(chatId, `Resolution set to: ${resolution}`);
        });
    } else if (data === 'set_crf') {
        bot.sendMessage(chatId, 'Enter CRF value (e.g., 23):');
        bot.once('message', (msg) => {
            crf = parseInt(msg.text, 10);
            bot.sendMessage(chatId, `CRF set to: ${crf}`);
        });
    } else if (data === 'set_encoding') {
        bot.sendMessage(chatId, 'Enter encoding type (e.g., x264):');
        bot.once('message', (msg) => {
            encoding = msg.text;
            bot.sendMessage(chatId, `Encoding set to: ${encoding}`);
        });
    } else if (data === 'set_preset') {
        bot.sendMessage(chatId, 'Choose preset: slow, fast, veryfast');
        bot.once('message', (msg) => {
            preset = msg.text.toLowerCase();
            bot.sendMessage(chatId, `Preset set to: ${preset}`);
        });
    } else if (data === 'process_video') {
        const { videoPath, subPath, logoPath } = userFiles[chatId];
        const outputPath = path.join(tempDir, `output_${chatId}.mp4`);

        bot.sendMessage(chatId, 'Processing video with progress tracking...');

        const ffmpegProcess = ffmpeg(videoPath)
            .input(logoPath)
            .complexFilter([
                `[1][0]scale2ref=w=iw/5:h=ow/mdar[logo][video]`,
                `[video][logo]overlay=W-w-10:10`,
                `subtitles=${subPath}:force_style='FontName=HelveticaRounded-Bold,Fontfile=${fontPath},Bold=1,FontSize=24'`,
                `scale=${resolution}`
            ])
            .outputOptions([
                `-c:v ${encoding}`,
                `-crf ${crf}`,
                `-preset ${preset}`,
                '-r 23.976',
                '-b:v 2000k',
                '-b:a 192k'
            ])
            .output(outputPath)
            .on('progress', (progress) => {
                bot.sendMessage(chatId, `Processing: ${Math.round(progress.percent)}% done`);
            })
            .on('end', () => {
                bot.sendVideo(chatId, fs.createReadStream(outputPath));
                fs.unlinkSync(videoPath);
                fs.unlinkSync(subPath);
                fs.unlinkSync(logoPath);
                fs.unlinkSync(outputPath);
            })
            .run();
    }
});

console.log('Bot is running...');
