import TelegramBot from "node-telegram-bot-api";
import fs from "fs";
import path from "path";
import config from "../config";
import { connect } from "../db";
import { Admins } from "../commands";
import { Excel } from "../services";
import { Tenants } from "../utils";
import { downloadFile } from "../utils/fileHandlers";
import { isDevUser } from "../utils/auth";

interface PendingUpload {
  filePath: string;
  messageId: number;
  fileId: string;
}

const pendingFileUploads = new Map<number, PendingUpload>();
const generateFileId = () => Math.random().toString(36).substring(7);

const DocHandler = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  isAddActive: boolean
) => {
  const chatId = msg.chat.id;
  const doc = msg.document;
  const admins = Admins.getOrderedAdmins();
  let downloadedFilePath: string | undefined;
  let db;

  try {
    db = await connect.getDB();
    const tenants = await Tenants(admins);

    if (!isAddActive) {
      await bot.sendMessage(
        chatId,
        "Используйте команду /addProducts для загрузки продуктов в виде файла Excel."
      );
      return;
    }

    if (!doc) {
      await bot.sendMessage(chatId, "Пожалуйста, загрузите документ.");
      return;
    }

    if (
      doc.mime_type !==
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      doc.file_name?.split(".").pop() !== "xlsx"
    ) {
      await bot.sendMessage(chatId, "Пожалуйста, загрузите файл Excel.");
      return;
    }

    // Generate a unique filename to avoid conflicts
    const uniqueFilename = `${Date.now()}_${doc.file_name}`;
    const fileLink = await bot.getFileLink(doc.file_id);
    downloadedFilePath = await downloadFile(fileLink, uniqueFilename, "get");

    if (!downloadedFilePath || !fs.existsSync(downloadedFilePath)) {
      console.error(
        "Failed to download file or file does not exist:",
        downloadedFilePath
      );
      await bot.sendMessage(chatId, "Ошибка загрузки файла.");
      return;
    }
    if (isDevUser(chatId)) {
      const fileId = generateFileId();
      const messageResponse = await bot.sendMessage(
        chatId,
        "Выберите, для какого региона вы хотите загрузить данные:",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Казахстан 🇰🇿",
                  callback_data: `upload_kz_${fileId}`,
                },
                {
                  text: "Узбекистан 🇺🇿",
                  callback_data: `upload_uz_${fileId}`,
                },
              ],
            ],
          },
        }
      );

      pendingFileUploads.set(chatId, {
        filePath: downloadedFilePath,
        messageId: messageResponse.message_id,
        fileId,
      });
      return;
    }

    const messageResponse = await bot.sendMessage(
      chatId,
      "✅ Файл успешно загружен."
    );

    await Excel.processExcelFile(
      downloadedFilePath,
      chatId,
      messageResponse.message_id,
      bot,
      db,
      tenants
    );
  } catch (error) {
    console.error("Error in document handler:", error);
    await bot.sendMessage(
      chatId,
      "Произошла ошибка. Пожалуйста, попробуйте позже."
    );
  } finally {
    // Clean up downloaded file if it exists and wasn't stored for pending upload
    if (
      downloadedFilePath &&
      fs.existsSync(downloadedFilePath) &&
      (!pendingFileUploads.has(chatId) ||
        pendingFileUploads.get(chatId)?.filePath !== downloadedFilePath)
    ) {
      try {
        fs.unlinkSync(downloadedFilePath);
      } catch (cleanupError) {
        console.error("Error cleaning up file:", cleanupError);
      }
    }
    if (db) {
      await connect.closeDB();
    }
  }
};

const handleTenantSelection = async (
  bot: TelegramBot,
  chatId: number,
  
  tenantChoice: "kz" | "uz",
  fileId: string,
  messageId: number
) => {
  let db;
  const pendingUpload = pendingFileUploads.get(chatId);

  if (!pendingUpload || pendingUpload.fileId !== fileId) {
    await bot.sendMessage(
      chatId,
      "Файл не найден или устарел. Пожалуйста, загрузите файл снова."
    );
    return;
  }

  if (!fs.existsSync(pendingUpload.filePath)) {
    console.error("File does not exist:", pendingUpload.filePath);
    await bot.sendMessage(
      chatId,
      "Файл не найден. Пожалуйста, загрузите файл снова."
    );
    pendingFileUploads.delete(chatId);
    return;
  }

  try {
    db = await connect.getDB();
    const tenantsCollection = db.collection("tenants");
    const tenantsArray = await tenantsCollection.find({}).toArray();
    
    // Map the tenants based on the user's choice
    const selectedTenant = tenantChoice === "kz" ? tenantsArray[0] : tenantsArray[1];
    const tenantsMap: { [key: string]: any } = {
      [chatId.toString()]: {
        _id: selectedTenant._id,
        country: selectedTenant.country,
        currency: selectedTenant.currency,
        phoneCode: selectedTenant.phoneCode,
        status: selectedTenant.status,
        languageCode: selectedTenant.languageCode
      }
    };

    try {
      await bot.deleteMessage(chatId, messageId);
    } catch (deleteError) {
      console.error("Error deleting message:", deleteError);
    }

    const newMessageResponse = await bot.sendMessage(
      chatId,
      "✅ Файл успешно загружен."
    );

    await Excel.processExcelFile(
      pendingUpload.filePath,
      chatId,
      newMessageResponse.message_id,
      bot,
      db,
      tenantsMap
    );
  } catch (error) {
    console.error("Error processing tenant selection:", error);
    await bot.sendMessage(
      chatId,
      "Произошла ошибка при обработке файла. Пожалуйста, попробуйте снова."
    );
  } finally {
    // Clean up
    const filePath = pendingUpload.filePath;
    pendingFileUploads.delete(chatId);

    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (cleanupError) {
        console.error("Error during cleanup:", cleanupError);
      }
    }

    if (db) {
      await connect.closeDB();
    }
  }
};

export { DocHandler, handleTenantSelection, pendingFileUploads };
