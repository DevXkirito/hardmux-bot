const mongoose = require("mongoose");

// MongoDB Connection
const connectDB = async () => {
    try {
        await mongoose.connect("mongodb+srv://kirito:kirito1100@cluster0.df3mb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0", {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log("✅ MongoDB Connected");
    } catch (error) {
        console.error("❌ MongoDB Connection Error:", error);
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
