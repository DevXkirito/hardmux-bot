require("dotenv").config();
const mongoose = require("mongoose");

// MongoDB Connection
const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            throw new Error("MONGO_URI is not defined in the .env file!");
        }

        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log("✅ MongoDB Connected");
    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error.message);
        process.exit(1);
    }
};

// User session schema
const UserSessionSchema = new mongoose.Schema({
    chatId: { type: Number, required: true, unique: true },
    videoPath: { type: String, default: null },
    subtitlePath: { type: String, default: null },
    filename: { type: String, default: null },
});

const UserSession = mongoose.model("UserSession", UserSessionSchema);

module.exports = { connectDB, UserSession };
