import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

import { Admins, Help, Orders, Start } from "./commands";
import { DocHandler, QueryHandler } from "./handlers";
import { Notification, ImageUploader } from "./services";
import config from "./config";

dotenv.config();

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error("BOT_TOKEN is not defined");
}

const bot = new TelegramBot(token, { polling: true });
let isAddActive = false;

const isAddActiveHandler = () =>
  isAddActive ? (isAddActive = false) : (isAddActive = true);

bot.onText(/\/start$/, async (msg) => Start(bot, msg));
bot.onText(/\/start +(.+)/, async (msg, match) =>
  Start(bot, msg, match as RegExpExecArray)
);
bot.onText(/\/help$/, async (msg) => Help.default(bot, msg));

bot.onText(/^\/orders$/, async (msg) => Orders.Orders(bot, msg, null));
bot.onText(/^\/orders +(.+)/, async (msg, match) =>
  Orders.Orders(bot, msg, match)
);

interface PendingUpload {
  images: Array<{
    fileId: string;
    url: string;
  }>;
  text?: string;
}

// Add this state management
const pendingUploads = new Map<number, PendingUpload>();

// Modify the addProducts command handler
bot.onText(/\/addImage/, async (msg) => {
  const chatId = msg.chat.id;
  const admins = config.bot.adminIds;
  const isAdmin = admins.some((adminId) => adminId === `${chatId}`);
  console.log({ isAdmin, admins, chatId });
  if (!isAdmin) {
    await bot.sendMessage(
      chatId,
      "Эта команда доступна только администраторам."
    );
    return;
  }
  isAddActive = true;
  pendingUploads.set(chatId, { images: [] });
  await bot.sendMessage(
    chatId,
    "Пожалуйста, отправьте текст описания продукта."
  );
});

bot.on("text", async (msg) => {
  const chatId = msg.chat.id;
  if (!isAddActive || !pendingUploads.has(chatId)) return;

  const pending = pendingUploads.get(chatId)!;
  if (!pending.text) {
    pending.text = msg.text;
    pendingUploads.set(chatId, pending);
    await bot.sendMessage(chatId, "Теперь отправьте фотографии продукта.");
    return;
  }
});

bot.onText(/\/addProducts/, async (msg) => {
  isAddActive = true;
  await bot.sendMessage(msg.chat.id, "Пожалуйста, загрузите файл Excel.");
});

bot.onText(/\/createAdminLink/, async (msg) => Admins.Admins(bot, msg));

// Modify the photo handler
bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  if (!isAddActive || !pendingUploads.has(chatId)) {
    return await bot.sendMessage(
      chatId,
      "Сначала используйте команду /addImage."
    );
  }

  const pending = pendingUploads.get(chatId)!;
  if (!pending.text) {
    return await bot.sendMessage(
      chatId,
      "Пожалуйста, сначала отправьте текст описания продукта. Как показано в качестве примера, пример: ID_(ID_)Имя"
    );
  }

  const fileId = msg.photo?.[msg.photo.length - 1].file_id as string;
  const fileLink = await bot.getFileLink(fileId as string);
  const url = await ImageUploader.uploadImageFromTelegram(fileLink);

  pending.images.push({ fileId, url });
  pendingUploads.set(chatId, pending);

  // Send confirmation button after receiving the image
  await bot.sendMessage(chatId, "Изображение загружено. Вы хотите:", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Добавить больше изображений",
            callback_data: "addMoreImages",
          },
          { text: "Подтвердить и сохранить", callback_data: "confirmUpload" },
        ],
      ],
    },
  });
});

bot.on("document", (msg) => DocHandler(bot, msg, isAddActive));

bot.on("callback_query", async (callbackQuery) =>
  QueryHandler(bot, callbackQuery)
);

Notification.NewOrderStream(bot).catch(console.error);
Notification.LowStockAlert(bot).catch(console.error);

export { pendingUploads, isAddActiveHandler };
