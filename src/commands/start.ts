import TelegramBot from "node-telegram-bot-api";

import config from "../config";
import { closeDB, getDB } from "../db/connect";
import { Order } from "../types";
import { formatOrderMessage } from "../utils";
import { getOrderedAdmins, pendingAdminInvites, saveAdmins } from "./admins";

const Start = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  match?: RegExpExecArray
) => {
  const chatId = msg.chat.id;
  const param = match?.[1];
  const admins = getOrderedAdmins();
  const telegramUsername = msg.from?.username;

  // Check if the user is an admin and has a telegram username
  if (
    !admins.some((adminId) => adminId === chatId.toString()) &&
    !telegramUsername
  ) {
    await bot.sendMessage(
      chatId,
      "Пожалуйста, укажите в настройках Telegram ваш никнейм, который вы указали при оформлении заказа."
    );
    return;
  }

  // Check if the user is an admin
  if (admins.some((adminId) => adminId === `${chatId}`)) {
    await bot.sendMessage(chatId, "Добро пожаловать в админ-панель!");
    return;
  }

  // Check if the user is an admin and has a pending invite
  if (param?.startsWith("admin_")) {
    const inviteCode = param.replace("admin_", "");
    const addedBy = pendingAdminInvites.get(inviteCode);

    console.log({ addedBy, inviteCode, chatId, pendingAdminInvites });

    // Check if the invite code is valid
    if (!addedBy) {
      await bot.sendMessage(chatId, "Приглашение недействительно.");
      return;
    } else {
      const addedAdmins = getOrderedAdmins();

      // Check if the user is already an admin
      if (
        admins.length > 2 &&
        admins.some((adminId) => adminId === chatId.toString())
      ) {
        const admin = {
          id: chatId.toString(),
          addedBy,
          addedAt: `${new Date()}`,
        };

        // Determine which admin group to add to based on addedBy
        const adminGroup = admins[0] === addedBy ? "admin_kz" : "admin_uz";

        saveAdmins({
          admin_uz: adminGroup === "admin_uz" ? [admin] : [],
          admin_kz: adminGroup === "admin_kz" ? [admin] : [],
        });

        await bot.sendMessage(
          addedBy,
          `Новый администратор добавлен! (@${telegramUsername})`
        );
        await bot.sendMessage(chatId, "Вы успешно добавлены в админ-панель.");
        return;
      }
    }
  }

  try {
    const db = await getDB();
    const orders = await db
      .collection("orders")
      .find({ telegramUsername: `@${telegramUsername}` })
      .toArray();

    const typedOrders: Order[] = orders.map((order) => ({
      _id: order._id,
      name: order.name,
      phone: order.phone,
      location: order.location,
      telegramUsername: order.telegramUsername,
      items: order.items,
      total: order.total,
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      totalAmount: order.totalAmount,
      tenantId: order.tenantId,
      currency: order.currency,
      isNew: order.isNew,
    }));

    if (typedOrders.length === 0) {
      await bot.sendMessage(
        chatId,
        "Добро пожаловать в наш бот, у вас нет заказов на данный момент. Вы можете сделать заказ на donix.uz или donix.kz."
      );
      return;
    } else {
      await displayUserOrders(bot, chatId.toString(), typedOrders);
    }
  } catch (error) {
    console.error("Error starting the bot:", error);
  } finally {
    await closeDB();
  }
};

const displayUserOrders = async (
  bot: TelegramBot,
  chatId: string,
  orders: Order[]
) => {
  for (const order of orders) {
    const orderMessage = formatOrderMessage({
      ...order,
    });
    const options: TelegramBot.SendMessageOptions = {
      parse_mode: "Markdown",
      reply_markup:
        order.status.toLowerCase() === "cancelled"
          ? undefined
          : {
              inline_keyboard: [
                [
                  { text: "Cancel", callback_data: `cancelled_${order._id}` },
                  {
                    text: "Delivered",
                    callback_data: `delivered_${order._id}`,
                  },
                ],
              ],
            },
    };

    await bot.sendMessage(chatId, orderMessage, options);
  }
};

export default Start;
