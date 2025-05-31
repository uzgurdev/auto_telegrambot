import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

import { Admins, Orders, Start } from "./commands";
import { DocHandler, QueryHandler } from "./handlers";
import { Notification, ImageUploader } from "./services";
import { connect } from "./db";

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
      "Please use the /addProducts command first."
    );
  }

  const pending = pendingUploads.get(chatId)!;
  if (!pending.text) {
    return await bot.sendMessage(
      chatId,
      "Please send product description text first."
    );
  }

  const fileId = msg.photo?.[msg.photo.length - 1].file_id as string;
  const fileLink = await bot.getFileLink(fileId as string);
  const url = await ImageUploader.uploadImageFromTelegram(fileLink);

  pending.images.push({ fileId, url });
  pendingUploads.set(chatId, pending);

  // Send confirmation button after receiving the image
  await bot.sendMessage(chatId, "Image uploaded. Do you want to:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "Add more images", callback_data: "addMoreImages" },
          { text: "Confirm and save", callback_data: "confirmUpload" },
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

// bot.onText(/\/addProductsWithOptions/, async (msg) => {
//   const options: SendMessageOptions = {
//     reply_markup: {
//       inline_keyboard: [
//         [
//           { text: "Add new product", callback_data: "add_new_product" },
//           { text: "Add Bulk products", callback_data: "add_bulk_products" },
//         ],
//       ],
//     },
//   };

//   await bot.sendMessage(
//     msg.chat.id,
//     "Please choose an option to add products.",
//     options
//   );
// });

// bot.on("callback_query", async (callbackQuery) => {
//   const message = callbackQuery.message;
//   const data = callbackQuery.data;

//   if (!data || !message) return;

//   switch (data) {
//     case "add_new_product":
//       isAddActive = true;
//       await bot.sendMessage(
//         message.chat.id,
//         "Please upload the image with the product's data."
//       );
//       break;
//     case "add_bulk_products":
//       isAddActive = true;
//       await bot.sendMessage(
//         message.chat.id,
//         "Please upload the Excel file with the products."
//       );
//       break;
//     // other cases...
//   }

//   bot.answerCallbackQuery(callbackQuery.id);
// });

export { pendingUploads, isAddActiveHandler };
