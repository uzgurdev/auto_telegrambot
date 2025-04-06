import TelegramBot from "node-telegram-bot-api";
import { Orders } from "../commands";

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
  }

  bot.answerCallbackQuery(query.id);
  return;
};

export default QueryHandler;
