import * as XLSX from "xlsx";
import fs from "fs";
import TelegramBot from "node-telegram-bot-api";
import { Db, ObjectId } from "mongodb";
import axios from "axios";
import { CarModel, Product, TenantMap } from "../types";
import { Products } from "../commands";

async function processExcelFile(
  filePath: string,
  chatId: number,
  messageId: number,
  bot: TelegramBot,
  db: Db,
  tenants: TenantMap
): Promise<void> {
  const tenantId = tenants[chatId]._id;

  // Send initial loading animation
  const loadingMsg = await bot.sendAnimation(
    chatId,
    "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
    { caption: "⏳ Обработка файла Excel..." }
  );

  // Read Excel file
  const fileBuffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(sheet) as Record<string, any>[];

  let insertedCount = 0;

  for (const row of data) {
    if (!row || Object.keys(row).length === 0) continue;

    const rowIndex = data.indexOf(row) + 2;
    try {
      const product = await parseProductFromExcelRow(
        row,
        tenantId,
        tenants[chatId].currency,
        bot,
        chatId,
        rowIndex,
        db
      );

      // Check for similar products
      const existingProduct = await Products.checkSimilarProduct(db, product);

      if (existingProduct !== null) {
        // Delete loading animation before asking decision
        await bot.deleteMessage(chatId, loadingMsg.message_id);

        const decision = await Products.askUserDecision(
          bot,
          product,
          existingProduct as Product & { _id: ObjectId },
          chatId
        );

        // Send loading animation again after decision
        const newLoadingMsg = await bot.sendAnimation(
          chatId,
          "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
          { caption: "⏳ Продолжаем обработку..." }
        );

        if (decision === "same") {
          await db
            .collection("products")
            .updateOne(
              { _id: existingProduct._id },
              { $inc: { inStock: product.inStock } }
            );
        } else if (decision === "new") {
          await db.collection("products").insertOne(product);
          insertedCount++;
        }

        // Delete the new loading animation
        await bot.deleteMessage(chatId, newLoadingMsg.message_id);
      } else {
        await db.collection("products").insertOne(product);
        await db
          .collection("auto_parts_categories")
          .insertOne({ name: product.name }); // tags
        const isCarBrandExist = await db
          .collection("category")
          .findOne({ name: product.producer });
        const isCarModelExist = await db
          .collection("category")
          .findOne({ name: product.carModel });

        if (!isCarBrandExist) {
          const carBrand = {
            name: product.producer,
            type: "carBrand",
            count: 1,
          };
          await db.collection("category").insertOne({ carBrand });
        } else {
          const carBrand = {
            name: isCarBrandExist.name,
            type: "carBrand",
            count: isCarBrandExist.count + 1,
          };

          await db.collection("category").insertOne({ carBrand });
        }

        if (!isCarModelExist) {
          const carBrand = {
            name: product.carModel,
            type: "carBrand",
            count: 1,
          };
          await db.collection("category").insertOne({ carBrand });
        } else {
          const carBrand = {
            name: isCarModelExist.name,
            type: "carBrand",
            count: isCarModelExist.count + 1,
          };

          await db.collection("category").insertOne({ carBrand });
        }
        insertedCount++;
      }
    } catch (error) {
      console.error(`Skipping row ${rowIndex}:`, (error as Error).message);
      continue;
    }
  }

  await bot.deleteMessage(chatId, loadingMsg.message_id);

  // Update message with results
  bot.editMessageText(
    insertedCount === 0
      ? "✅ Загрузка завершена! Существующие продукты обновлены."
      : `✅ Загрузка завершена! Добавлено ${insertedCount} товара.`,
    {
      chat_id: chatId,
      message_id: messageId,
    }
  );

  // Clean up
  fs.unlinkSync(filePath);
  return;
}

async function parseProductFromExcelRow(
  row: Record<string, any>,
  tenantId: ObjectId,
  currency: string,
  bot: TelegramBot,
  chatId: number,
  rowNumber: number,
  db: Db
): Promise<Product> {
  const carModelsEnum = Object.values(CarModel);
  const carModels: string[] = [];
  let position = "";

  // Parse car models from name
  for (const model of carModelsEnum) {
    const regex = new RegExp(
      `\\b${String(model)}\\b|\\b${String(model)}\\d*\\b|\\b${String(
        model
      ).replace("/", "\\/")}\\b`,
      "i"
    );
    if (regex.test(row["Наименование"])) {
      carModels.push(model as string);
    }
  }

  // Parse position information
  const positionRegex =
    /(передний|задний|левый|правый|верхний|нижний|центральный|боковой|основной)/gi;
  const directionRegex = /(LH|RH|LH\/RH|RH\/LH)/gi;
  const positionMatch = row["Наименование"]?.match(positionRegex);
  const directionMatch = row["Наименование"]?.match(directionRegex);

  position = [positionMatch?.[0]?.trim(), directionMatch?.[0]?.trim()]
    .filter(Boolean)
    .join(" ");

  // Parse product name
  const nameParts = row["Наименование"]?.split(" ");
  console.log({ nameParts, rowNumber });
  if (!nameParts) {
    // Send message to admin
    await bot.sendMessage(
      chatId,
      `❌ Строка ${rowNumber}: Отсутствует наименование детали. Пожалуйста, укажите название детали.`
    );
    throw new Error(`Missing product name in row ${rowNumber}`);
  }
  let productName = nameParts[0] || "";
  if (nameParts[1] && !positionRegex.test(nameParts[1])) {
    productName += ` ${nameParts[1]}`;
  }

  // Get other details
  const producer = row["Фирма"] || "";
  const carPartIdsStr = String(row["Номер"] || "");
  const price = row["Стоимость"] || 0;
  const inStock = row["Itogo"] || 0;

  const carPartIds = isNaN(Number(carPartIdsStr))
    ? carPartIdsStr.split(" ")
    : [carPartIdsStr];

  // Default images
  let images: string[] = ["https://picsum.photos/200/300"];

  // Fetch images from the images collection in the database
  try {
    const imagesDocs = await db
      .collection("images")
      .find({}) // fetch all, filter below
      .toArray();

    images = [];

    for (const carPartId of carPartIds) {
      for (const imgDoc of imagesDocs) {
        const productID = imgDoc.productID;
        if (productID === carPartId) {
          images.push(imgDoc.url);
        } else if (productID.includes("_")) {
          const afterUnderscore = productID.split("_")[1];
          if (afterUnderscore && isNaN(Number(afterUnderscore))) {
            // after underscore is string, compare with productName
            if (afterUnderscore.toLowerCase() === productName.toLowerCase()) {
              images.push(imgDoc.url);
            }
          } else {
            // after underscore is not string, compare with carPartId
            if (carPartId === afterUnderscore) {
              images.push(imgDoc.url);
            }
          }
        }
      }
    }

    if (images.length === 0) {
      images = ["https://picsum.photos/200/300"];
    }
  } catch (error) {
    // Handle error
  }

  return {
    name: productName,
    position: position,
    carModel: carModels,
    producer: producer,
    carPartIds: carPartIds,
    price: price,
    currency: currency,
    inStock: inStock,
    lowStockAlert: 0,
    tenantId: tenantId,
    images: images,
  };
}

export { processExcelFile, parseProductFromExcelRow };
