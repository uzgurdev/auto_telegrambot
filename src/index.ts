import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

import { Admins, Help, Orders, Start } from "./commands";
import { DocHandler, QueryHandler } from "./handlers";
import { Notification, ImageUploader } from "./services";
import { connect } from "./db";
import config from "./config";

dotenv.config();

// Define interface for image document
interface ImageDocument {
  id: string;
  productID: string;
  url: string;
  addedBy: number;
  createdAt: Date;
}

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
  confirmationMessageSent?: boolean; // New flag to track if confirmation was sent
}

// Add this state management
const pendingUploads = new Map<number, PendingUpload>();

// Modify the addProducts command handler
bot.onText(/\/addImage/, async (msg) => {
  const chatId = msg.chat.id;
  const admins = config.bot.adminIds;
  const isAdmin = admins.some((adminId) => adminId === `${chatId}`);

  if (!isAdmin) {
    await bot.sendMessage(
      chatId,
      "Эта команда доступна только администраторам."
    );
    return;
  }
  isAddActive = true;
  pendingUploads.set(chatId, { images: [], confirmationMessageSent: false });
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
    // Check for existing images
    try {
      const db = await connect.getDB();
      const existingImages = await db
        .collection<ImageDocument>("images")
        .find({ productID: msg.text })
        .toArray();

      if (existingImages.length > 0) {
        // Show existing images to the user
        const imageUrls = existingImages.map((img) => img.url);
        const message =
          "⚠️ Для этого продукта уже существуют изображения:\n\n" +
          imageUrls
            .map((url: string, i: number) => `${i + 1}. ${url}`)
            .join("\n") +
          "\n\nХотите добавить дополнительные изображения?";

        await bot.sendMessage(chatId, message, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "Да, добавить еще", callback_data: "continue_upload" },
                { text: "Нет, отменить", callback_data: "cancel_upload" },
              ],
            ],
          },
        });
        return;
      }
    } catch (error) {
      console.error("Error checking existing images:", error);
    }

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

  // Only send the confirmation message after collecting all images from the message
  if (!pending.confirmationMessageSent && msg.media_group_id === undefined) {
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
    pending.confirmationMessageSent = true;
  } else if (!pending.confirmationMessageSent && msg.media_group_id) {
    // For media groups (multiple images), wait until we receive them all
    setTimeout(async () => {
      if (!pending.confirmationMessageSent) {
        await bot.sendMessage(chatId, "Все изображения загружены. Вы хотите:", {
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
        pending.confirmationMessageSent = true;
      }
    }, 1000); // Wait 1 second to ensure all media group items are processed
  }

  pendingUploads.set(chatId, pending);
});

bot.on("document", (msg) => DocHandler.DocHandler(bot, msg, isAddActive));

bot.on("callback_query", async (callbackQuery) => {
  const chatId = callbackQuery.message?.chat.id;
  if (!chatId) return;

  const query = callbackQuery.data;

  switch (query) {
    case "continue_upload":
      const pendingContinue = pendingUploads.get(chatId);
      if (pendingContinue) {
        pendingContinue.confirmationMessageSent = false;
        pendingUploads.set(chatId, pendingContinue);
      }
      await bot.sendMessage(
        chatId,
        "Пожалуйста, отправьте дополнительные фотографии."
      );
      await bot.answerCallbackQuery(callbackQuery.id);
      break;

    case "cancel_upload":
      pendingUploads.delete(chatId);
      isAddActive = false;
      await bot.sendMessage(chatId, "Загрузка изображений отменена.");
      await bot.answerCallbackQuery(callbackQuery.id);
      break;

    case "addMoreImages":
      const pendingAddMore = pendingUploads.get(chatId);
      if (pendingAddMore) {
        pendingAddMore.confirmationMessageSent = false;
        pendingUploads.set(chatId, pendingAddMore);
      }
      await bot.sendMessage(
        chatId,
        "Пожалуйста, отправьте дополнительные фотографии."
      );
      await bot.answerCallbackQuery(callbackQuery.id);
      break;

    default:
      await QueryHandler(bot, callbackQuery);
      break;
  }
});

Notification.NewOrderStream(bot).catch(console.error);
// Notification.LowStockAlert(bot).catch(console.error);

export { pendingUploads, isAddActiveHandler };
