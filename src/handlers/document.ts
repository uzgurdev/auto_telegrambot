import TelegramBot from "node-telegram-bot-api";
import config from "../config";
import { connect } from "../db";
import { Admins } from "../commands";
import { Excel } from "../services";
import { Tenants } from "../utils";
import { downloadFile } from "../utils/fileHandlers";

const DocHandler = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  isAddActive: boolean
) => {
  const chatId = msg.chat.id;
  const doc = msg.document;
  const admins = Admins.getOrderedAdmins();

  try {
    const db = await connect.getDB();
    const tenants = await Tenants(admins);

    if (!isAddActive)
      return await bot.sendMessage(
        chatId,
        "Используйте команду /addProduct для загрузки продуктов в виде файла Excel."
      );

    if (!doc)
      return await bot.sendMessage(chatId, "Пожалуйста, загрузите документ.");

    if (
      doc.mime_type !==
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      doc.file_name?.split(".").pop() !== "xlsx"
    )
      return await bot.sendMessage(chatId, "Пожалуйста, загрузите файл Excel.");

    const fileLink = await bot.getFileLink(doc.file_id);
    const filePath = await downloadFile(fileLink, doc.file_name, "get");

    if (!filePath)
      return await bot.sendMessage(chatId, "Ошибка загрузки файла.");

    const messageResponse = await bot.sendMessage(
      chatId,
      "✅ Файл успешно загружен."
    );
    await Excel.processExcelFile(
      filePath,
      chatId,
      messageResponse.message_id,
      bot,
      db,
      tenants
    );
  } catch (error) {
    console.error("Error processing document:", error);
  } finally {
    await connect.closeDB();
  }
};

export default DocHandler;
