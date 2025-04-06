import TelegramBot from "node-telegram-bot-api";
import { Db, ObjectId } from "mongodb";

import { Product } from "../types";

const checkSimilarProduct = async (db: Db, product: Product) => {
  return db.collection("products").findOne({
    name: product.name,
    carModel: product.carModel,
    producer: product.producer,
    tenantId: product.tenantId,
    carPartIds: { $all: product.carPartIds },
  });
};

const askUserDecision = async (
  bot: TelegramBot,
  product: Product,
  existingProduct: Product,
  chatId: number
): Promise<"new" | "same"> => {
  const formatProductInfo = (p: Product) =>
    `${p.name} (${p.carModel}, ${p.carPartIds.join(",")})`;

  const messageText = [
    `⚠️ *Найден похожий товар!* ⚠️`,
    `*Существующий:* ${formatProductInfo(existingProduct)}`,
    `*Новый:* ${formatProductInfo(product)}\n`,
    `Хотите добавить его как новый товар или считать его тем же самым?`,
  ].join("\n");

  const message = await bot.sendMessage(chatId, messageText, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Добавить как новый", callback_data: `new_${chatId}` }],
        [
          {
            text: "♻️ Считать как то же самое",
            callback_data: `same_${chatId}`,
          },
        ],
      ],
    },
  });

  return new Promise((resolve) => {
    bot.once("callback_query", (query) => {
      if (!query.data?.endsWith(`_${chatId}`)) return;

      bot.answerCallbackQuery(query.id);
      const decision = query.data.split("_")[0] as "new" | "same";
      resolve(decision);

      if (message.message_id) {
        bot.deleteMessage(chatId, message.message_id);
      }
    });
  });
};

export async function addProduct(db: Db, product: Product): Promise<ObjectId> {
  const result = await db.collection("products").insertOne(product);
  return result.insertedId;
}

export async function updateProductStock(
  db: Db,
  productId: ObjectId,
  additionalStock: number
): Promise<void> {
  await db
    .collection("products")
    .updateOne({ _id: productId }, { $inc: { inStock: additionalStock } });
}

export { checkSimilarProduct, askUserDecision };
