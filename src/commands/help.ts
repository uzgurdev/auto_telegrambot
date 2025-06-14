import config from "../config";
import TelegramBot from "node-telegram-bot-api";

const Help = (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  match?: RegExpExecArray
) => {
  const admins = config.bot.adminIds;
  const chatId = msg.chat.id;
  const usersHelpMessage = `
  Привет! Я бот для управления заказами и продуктами.`;
  const adminsHelpMessage = `
  Привет! Я бот для управления заказами и продуктами.\nВот список доступных команд:\n/start - Начать взаимодействие с ботом\n/orders - Просмотреть заказы\n/addProduct - Добавить новый продукт\n/addImage - Добавить изображение продукта\n/help - Получить помощь по командам`;
  const helpMessage = admins.includes(`${chatId}`)
    ? adminsHelpMessage
    : usersHelpMessage;

  bot.sendMessage(chatId, helpMessage, {
    parse_mode: "Markdown",
    reply_markup: {
      keyboard: [
        [{ text: "/start" }],
        [{ text: "/orders" }],
        [{ text: "/addProducts" }],
        [{ text: "/addImage" }],
        [{ text: "/help" }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });
};

export default Help;
