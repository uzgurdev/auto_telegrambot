import * as XLSX from "xlsx";
import fs from "fs";
import TelegramBot from "node-telegram-bot-api";
import { Db, ObjectId } from "mongodb";
import axios from "axios";
import {
  CarModel,
  CarBrand,
  Product,
  TenantMap,
  CAR_BRAND_TO_MODELS,
  getCarBrandFromModel,
} from "../types";
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
        try {
          await bot.deleteMessage(chatId, loadingMsg.message_id);
        } catch (error) {
          console.log("Error deleting loading message: ", error);
        }

        const decision = await Products.askUserDecision(
          bot,
          product,
          existingProduct as Product & { _id: ObjectId },
          chatId
        );

        const newLoadingMsg = await bot.sendAnimation(
          chatId,
          "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif",
          { caption: "⏳ Продолжаем обработку..." }
        );

        if (decision === "same") {
          await db
            .collection("products")
            .updateOne({ _id: existingProduct._id }, { $set: product });
        } else if (decision === "new") {
          await db.collection("products").insertOne(product);
          insertedCount++;
        }

        try {
          await bot.deleteMessage(chatId, newLoadingMsg.message_id);
        } catch (error) {
          console.log("Error deleting new loading message: ", error);
        }
      } else {
        await db.collection("products").insertOne(product);
        await updateCategories(db, product);
        insertedCount++;
      }
    } catch (error) {
      console.error(`Skipping row ${rowIndex}:`, (error as Error).message);
      continue;
    }
  }

  try {
    await bot.deleteMessage(chatId, loadingMsg.message_id);
  } catch (error) {
    console.log("Error deleting final loading message: ", error);
  }

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
  const detectedCarModels: string[] = [];
  let carBrand = "";
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
      detectedCarModels.push(model as string);

      // Determine car brand from the first detected model
      if (!carBrand) {
        const brandFromModel = getCarBrandFromModel(model as CarModel);
        if (brandFromModel) {
          carBrand = brandFromModel;
        }
      }
    }
  }

  // If no car brand detected from models, try to detect directly from producer
  if (!carBrand && row["Фирма"]) {
    const producer = row["Фирма"].toUpperCase();
    // Check if producer contains car brand names
    for (const brand of Object.values(CarBrand)) {
      if (producer.includes(brand)) {
        carBrand = brand;
        break;
      }
    }
  }

  // Default car brand if not detected
  if (!carBrand) {
    carBrand = "UNIVERSAL"; // For universal parts
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
  if (!nameParts) {
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

  const carPartIds = isNaN(Number(carPartIdsStr))
    ? carPartIdsStr.split(" ")
    : [carPartIdsStr];

  // Get images
  const images = await getProductImages(db, carPartIds, productName);

  return {
    name: productName,
    position: position,
    producer: producer,
    carBrand: carBrand,
    carModel: detectedCarModels,
    carPartIds: carPartIds,
    price: price,
    currency: currency,
    tenantId: tenantId,
    images: images,
  };
}

async function getProductImages(
  db: Db,
  carPartIds: string[],
  productName: string
): Promise<string[]> {
  let images: string[] = [];

  try {
    const imagesDocs = await db.collection("images").find({}).toArray();

    for (const carPartId of carPartIds) {
      for (const imgDoc of imagesDocs) {
        const productID = imgDoc.productID;
        if (productID === carPartId) {
          images.push(imgDoc.url);
        } else if (productID.includes("_")) {
          const afterUnderscore = productID.split("_")[1];
          if (afterUnderscore && isNaN(Number(afterUnderscore))) {
            if (afterUnderscore.toLowerCase() === productName.toLowerCase()) {
              images.push(imgDoc.url);
            }
          } else {
            if (carPartId === afterUnderscore) {
              images.push(imgDoc.url);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("Error fetching images:", error);
  }

  if (images.length === 0) {
    images = ["https://picsum.photos/200/300"];
  }

  return images;
}

// Update categories for hierarchy
async function updateCategories(db: Db, product: Product): Promise<void> {
  try {
    // Add to auto_parts_categories (tags)
    await db
      .collection("auto_parts_categories")
      .insertOne({ name: product.name });

    // Update producer brand category
    const existingProducer = await db.collection("category").findOne({
      name: product.producer,
      type: "producer",
    });

    if (!existingProducer) {
      await db.collection("category").insertOne({
        name: product.producer,
        type: "producer",
        count: 1,
      });
    } else {
      await db
        .collection("category")
        .updateOne({ _id: existingProducer._id }, { $inc: { count: 1 } });
    }

    // Update car brand category
    const existingCarBrand = await db.collection("category").findOne({
      name: product.carBrand,
      type: "carBrand",
    });

    if (!existingCarBrand) {
      await db.collection("category").insertOne({
        name: product.carBrand,
        type: "carBrand",
        count: 1,
      });
    } else {
      await db
        .collection("category")
        .updateOne({ _id: existingCarBrand._id }, { $inc: { count: 1 } });
    }

    // Update car model categories
    for (const model of product.carModel) {
      const existingCarModel = await db.collection("category").findOne({
        name: model,
        type: "carModel",
      });

      if (!existingCarModel) {
        await db.collection("category").insertOne({
          name: model,
          type: "carModel",
          count: 1,
        });
      } else {
        await db
          .collection("category")
          .updateOne({ _id: existingCarModel._id }, { $inc: { count: 1 } });
      }
    }
  } catch (error) {
    console.error("Error updating categories:", error);
  }
}

export { processExcelFile, parseProductFromExcelRow };
