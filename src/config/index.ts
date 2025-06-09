import dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config();

const uploadsPath = path.join(__dirname, "../../uploads");
// Ensure uploads directory exists
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

const config = {
  bot: {
    token: process.env.BOT_TOKEN,
    adminIds: (process.env.ADMIN_IDS || "").split(","),
  },
  db: {
    uri: process.env.MONGO_URI || "",
    name: process.env.DB_NAME || "auto",
  },
  pagination: {
    pageSize: 3,
  },
  paths: {
    uploads: uploadsPath,
    admins: path.join(__dirname, "../../data/admins.json"),
  },
};

// Validate critical configuration
if (!config.bot.token) {
  throw new Error("BOT_TOKEN is not defined in environment variables");
}

if (!config.db.uri) {
  throw new Error("MONGO_URI is not defined in environment variables");
}

export default config;
