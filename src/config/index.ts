import dotenv from "dotenv";
import path from "path";

dotenv.config();

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
    uploads: path.join(__dirname, "../../uploads"),
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
