import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";
import axios, { AxiosError } from "axios";
import fs from "fs";
import path from "path";
import * as https from "https";
import FormData from "form-data";

import { Admins, Orders, Start } from "./commands";
import { DocHandler, QueryHandler } from "./handlers";
import { Notification } from "./services";

dotenv.config();

const token = process.env.BOT_TOKEN;

if (!token) {
  throw new Error("BOT_TOKEN is not defined");
}

const bot = new TelegramBot(token, { polling: true });
let isAddActive = false;

bot.onText(/\/start$/, async (msg) => Start(bot, msg));
bot.onText(/\/start +(.+)/, async (msg, match) =>
  Start(bot, msg, match as RegExpExecArray)
);

bot.onText(/^\/orders$/, async (msg) => Orders.Orders(bot, msg, null));
bot.onText(/^\/orders +(.+)/, async (msg, match) =>
  Orders.Orders(bot, msg, match)
);

bot.onText(/\/addProducts/, async (msg) => {
  isAddActive = true;
  await bot.sendMessage(msg.chat.id, "Пожалуйста, загрузите файл Excel.");
});

bot.onText(/\/createAdminLink/, async (msg) => Admins.Admins(bot, msg));

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;
  // if (!isAddActive)
  //   return await bot.sendMessage(
  //     chatId,
  //     "Please use the /add command to upload the product image."
  //   );

  const fileId = msg.photo?.[msg.photo.length - 1]?.file_id;
  if (!fileId) {
    return await bot.sendMessage(
      chatId,
      "❌ Error receiving the image. Please try again."
    );
  }

  const filePath = await handleAddImage(fileId);

  if (!filePath) {
    return await bot.sendMessage(
      chatId,
      "❌ Error downloading the image. Please try again."
    );
  }

  await bot.sendMessage(chatId, `✅ Image received successfully.`);
  isAddActive = false;
});

async function handleAddImage(fileId: string) {
  try {
    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const filePath = await path.join(
      __dirname,
      "uploads",
      file.file_path?.split("/").pop()!
    );

    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }

    await new Promise<void>((resolve, reject) => {
      const fileStream = fs.createWriteStream(filePath);
      https.get(fileUrl, (response) => {
        response.pipe(fileStream);
        fileStream.on("error", reject);
        fileStream.on("finish", () => resolve());
      });
    });

    const formData = new FormData();
    formData.append("image", fs.createReadStream(filePath));

    const response = await axios.post(
      "http://localhost:5000/api/v1/images/upload",
      formData,
      {
        headers: formData.getHeaders(),
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      }
    );

    if (response.status !== 200) {
      throw new Error("Failed to send image to server");
    }

    return filePath;
  } catch (error) {
    console.error(error);
    return null;
  }
}

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
