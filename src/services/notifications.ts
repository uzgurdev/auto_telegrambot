import { Admins } from "../commands";
import { connect } from "../db";
import { Order } from "../types";
import config from "../config";
import { formatOrderMessage, Tenants } from "../utils";
import TelegramBot from "node-telegram-bot-api";
import { ObjectId } from "mongodb";

const NewOrderStream = async (bot: TelegramBot) => {
  try {
    const db = await connect.getDB();
    const orders = db.collection("orders");

    const changeStream = orders.watch();
    changeStream.on("change", async (change) => {
      if (change.operationType === "insert") {
        const newOrder = change.fullDocument;
        AdminMessage(bot, newOrder as Order);
      }
    });
  } catch (error) {
    console.error("Error creating new order:", error);
  }
};

const AdminMessage = async (bot: TelegramBot, order: Order) => {
  const devIds = process.env.DEV_IDS ? process.env.DEV_IDS.split(",") : [];
  const admins = [...Admins.getOrderedAdmins(), ...devIds];

  try {
    const tenants = await Tenants(admins);
    for (const chatId of admins) {
      const tenant = tenants[chatId];

      const options = {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Отмена",
                callback_data: `cancelled_${order._id}`,
              },
              {
                text: "Доставлен",
                callback_data: `delivered_${order._id}`,
              },
            ],
          ],
        },
      };

      if (order.tenantId.equals(tenant._id)) {
        await bot.sendMessage(
          chatId,
          formatOrderMessage(order),
          options as TelegramBot.SendMessageOptions
        );
      }
    }
  } catch (error) {
    console.error("Error sending admin message:", error);
  }
};

// const LowStockAlert = async (bot: TelegramBot) => {
//   const admins = Admins.getOrderedAdmins();
//   try {
//     const db = await connect.getDB();
//     const products = db.collection("products");

//     const changeStream = products.watch();
//     changeStream.on("change", async (change) => {
//       if (change.operationType === "update") {
//         const updatedProduct = change.fullDocument;
//         console.dir({ updatedProduct }, { depth: null });
//         if (updatedProduct?.isStock <= updatedProduct?.lowStockAlert) {
//           for (const chatId of admins) {
//             await bot.sendMessage(
//               chatId,
//               `Товар ${updatedProduct?.name} заканчивается на складе. Осталось ${updatedProduct?.stock} штук.`
//             );
//           }
//         }
//       }
//     });
//   } catch (error) {
//     console.error("Error creating low stock alert:", error);
//   }
// };

export { NewOrderStream };
