import fs from "fs";
import path from "path";
import TelegramBot from "node-telegram-bot-api";

import { AdminMap } from "../types";
import config from "../config";
import { isEmpty } from "lodash";

const pendingAdminInvites = new Map<string, string>();

export function loadAdmins(): AdminMap {
  try {
    if (fs.existsSync(config.paths.admins)) {
      return JSON.parse(fs.readFileSync(config.paths.admins, "utf8"));
    }
  } catch (error) {
    console.error("Error reading admins file:", error);
  }

  // Return empty admin map if file doesn't exist or there's an error
  return { admin_kz: [], admin_uz: [] };
}

// Then, to create the array in the specific format you want:
function getOrderedAdmins(): string[] {
  const addedAdmins = loadAdmins();
  const admins = [
    config.bot.adminIds[0],
    addedAdmins.admin_kz.length > 0 ? addedAdmins.admin_kz[0].id : null,
    config.bot.adminIds[1],
    addedAdmins.admin_uz.length > 0 ? addedAdmins.admin_uz[0].id : null,
  ];

  // Filter out any null values in case admin_kz or admin_uz doesn't exist
  return admins.filter((admin) => admin !== null);
}

const Admins = async (bot: TelegramBot, msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const admins = getOrderedAdmins();

  if (chatId.toString() !== admins[0] || chatId.toString() !== admins[1]) {
    await bot.sendMessage(
      chatId,
      "У вас нет разрешения на использование этой команды."
    );
    return;
  }

  if (
    admins.length >= 4 &&
    (chatId.toString() === admins[0] || chatId.toString() === admins[1])
  ) {
    await bot.sendMessage(
      chatId,
      "Максимальное количество администраторов - 2"
    );
    return;
  }

  try {
    const inviteCode = generateAdminInviteCode();
    pendingAdminInvites.set(inviteCode, chatId.toString());

    const botInfo = await bot.getMe();
    const inviteLink = `https://t.me/${botInfo.username}?start=admin_${inviteCode}`;

    await bot.sendMessage(
      chatId,
      `Пригласите нового администратора по ссылке: \n${inviteLink}\n\nСрок действия этой ссылки истекает через 24 часа.`
    );

    setTimeout(() => {
      pendingAdminInvites.delete(inviteCode);
    }, 24 * 60 * 60 * 1000);
  } catch (error) {
    console.error("Error in admins command", error);
    await bot.sendMessage(chatId, "Произошла ошибка");
  }
};

const generateAdminInviteCode = (): string => {
  return Math.random().toString(36).substring(7);
};

const saveAdmins = (admins: AdminMap): void => {
  try {
    const dir = path.dirname(config.paths.admins);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(config.paths.admins, JSON.stringify(admins, null, 2));
  } catch (error) {
    console.error("Error writing admins file:", error);
  }
};

export { Admins, pendingAdminInvites, saveAdmins, getOrderedAdmins };
