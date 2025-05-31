import TelegramBot from "node-telegram-bot-api";
import { Orders } from "../commands";
import { pendingUploads } from "../index";
import { connect } from "../db";

const QueryHandler = async (
  bot: TelegramBot,
  query: TelegramBot.CallbackQuery
) => {
  const message = query.message;
  const data = query.data;

  if (!message || !data) return;
  const chatId = message.chat.id;
  const messageId = message.message_id;

  const [command, action, ...args] = data.split("_");

  switch (command) {
    case "orders-page":
      Orders.editOrdersMessage(bot, chatId, messageId, +action);
      break;
    case "orders-download":
      Orders.DownloadOrders(bot, chatId);
      break;
    case "cancelled":
    case "delivered":
      Orders.UpdateOrderStatus(bot, `${chatId}`, action, command);
      break;
    case "addMoreImages":
      await bot.sendMessage(chatId, "Please send more images.");
      await bot.answerCallbackQuery(query.id);
      break;
    case "confirmUpload":
      await ConfirmUpload(bot, chatId, messageId, args, query);
      break;
  }

  bot.answerCallbackQuery(query.id);
  return;
};

const ConfirmUpload = async (
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  args: string[],
  query: TelegramBot.CallbackQuery
) => {
  const pending = pendingUploads.get(chatId);
  if (!pending || !pending.text || pending.images.length === 0) {
    await bot.sendMessage(chatId, "No pending uploads found.");
    await bot.answerCallbackQuery(query.id);
    return;
  }

  try {
    const db = await connect.getDB();

    // Save all images with the same product text
    for (const image of pending.images) {
      await db.collection("images").insertOne({
        id: Date.now().toString(),
        productID: pending.text,
        url: image.url,
        addedBy: query.from.id,
        createdAt: new Date(),
      });
    }

    await bot.sendMessage(chatId, "All images saved successfully!");
    // Clean up
    pendingUploads.delete(chatId);
    // isAddActive = false;
  } catch (error) {
    console.error("Database error:", error);
    await bot.sendMessage(chatId, "Failed to save images.");
  }

  await bot.answerCallbackQuery(query.id);
};

export default QueryHandler;
