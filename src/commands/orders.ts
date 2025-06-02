import TelegramBot from "node-telegram-bot-api";
import { ObjectId } from "mongodb";
import { closeDB, getDB } from "../db/connect";
import { getOrderedAdmins } from "./admins";
import config from "../config";
import { Order } from "../types";
import { formatOrderMessage, Tenants } from "../utils";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

const Orders = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  match: RegExpExecArray | null
) => {
  const chatId = msg.chat.id;
  const query = match?.[1] ?? null;
  const admins = getOrderedAdmins();

  if (!admins.includes(chatId.toString())) {
    await bot.sendMessage(
      chatId,
      "У вас нет разрешения на использование этой команды."
    );
    return;
  }

  try {
    const db = await getDB();
    const collections = await db.listCollections().toArray();
    const orderCollectionExists = collections.some(
      (col) => col.name === "orders"
    );

    if (!orderCollectionExists) {
      await bot.sendMessage(chatId, "База данных заказов не инициализирована.");
      return;
    }

    const ordersC = db.collection("orders");
    const ordersCount = await ordersC.countDocuments();

    if (ordersCount === 0) {
      await bot.sendMessage(chatId, "База данных заказов пуста.");
      return;
    }

    const orders = db.collection("orders");
    const tenants = await Tenants(admins);
    const tenant = tenants[chatId];

    if (ObjectId.isValid(query as string)) {
      return await handleSingleOrder(
        bot,
        chatId,
        orders,
        tenant,
        query as string
      );
    }

    const { orderMessages, options } = await prepareOrdersData(
      orders,
      tenant,
      query,
      0
    );

    if (!orderMessages) {
      return bot.sendMessage(chatId, "Заказов не найдено.");
    }

    return bot.sendMessage(chatId, orderMessages, options || undefined);
  } catch (error) {
    console.error("Error in /orders command: ", error);
    await bot.sendMessage(chatId, "Произошла ошибка при получении заказов.");
  } finally {
    await closeDB();
  }
};

const handleSingleOrder = async (
  bot: TelegramBot,
  chatId: number,
  orders: any,
  tenant: any,
  query: string
) => {
  const userOrders = await orders
    .find({
      _id: new ObjectId(query),
      tenantId: tenant._id,
    })
    .toArray();

  if (userOrders.length === 0) {
    return bot.sendMessage(chatId, "Заказ не найден.");
  }

  const orderMessages = formatOrderMessage({
    isNew: false,
    ...userOrders[0],
  } as Order);

  const options: TelegramBot.SendMessageOptions = {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard:
        userOrders[0].status === "cancelled" ||
        userOrders[0].status === "delivered"
          ? []
          : [
              [
                {
                  text: "Отмена",
                  callback_data: `cancel_${userOrders[0]._id}`,
                },
                {
                  text: "Заказ выполнен",
                  callback_data: `delivered_${userOrders[0]._id}`,
                },
              ],
            ],
    },
  };

  return bot.sendMessage(chatId, orderMessages, options);
};

const buildFilter = (tenantId: string, query: string | null) => {
  const filter: any = { tenantId };
  if (query) {
    if (ObjectId.isValid(query)) {
      filter.$or = [
        ...createTextSearchFilters(query),
        { _id: new ObjectId(query) },
      ];
    } else {
      filter.$or = createTextSearchFilters(query);
    }
  }
  return filter;
};

const createTextSearchFilters = (query: string) => {
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return ["name", "phone", "location", "telegramUsername", "status"].map(
    (field) => ({ [field]: { $regex: escapedQuery, $options: "i" } })
  );
};

const prepareOrdersData = async (
  orders: any,
  tenant: any,
  query: string | null,
  page: number = 0
) => {
  const filter = buildFilter(tenant._id, query);
  const userOrders = await orders
    .find(filter)
    .skip(page * config.pagination.pageSize)
    .limit(config.pagination.pageSize)
    .toArray();

  if (userOrders.length === 0) {
    return { orderMessages: null, options: null };
  }

  const orderMessages = userOrders
    .map((order: any) => formatOrderMessage({ isNew: false, ...order }))
    .join("\n\n-----------\n\n");

  const totalOrders = await orders.countDocuments({ tenantId: tenant._id });
  const totalPages = Math.ceil(totalOrders / config.pagination.pageSize);

  const inlineKeyboard = [
    Array.from({ length: totalPages }, (_, i) => ({
      text: `${i + 1}`,
      callback_data: `orders-page_${i}`,
    })),
    [{ text: "Download Orders", callback_data: `orders-download` }],
  ];

  const options = {
    parse_mode: "Markdown" as TelegramBot.ParseMode,
    reply_markup: { inline_keyboard: inlineKeyboard },
  };

  return { orderMessages, options };
};

const editOrdersMessage = async (
  bot: TelegramBot,
  chatId: number,
  messageId: number,
  page: number,
  query?: string
) => {
  try {
    const db = await getDB();
    const orders = db.collection("orders");
    const tenants = await Tenants([chatId.toString()]);
    const tenant = tenants[chatId];

    const { orderMessages, options } = await prepareOrdersData(
      orders,
      tenant,
      query || null,
      page
    );

    if (!orderMessages) {
      return bot.editMessageText("Заказов не найдено.", {
        chat_id: chatId,
        message_id: messageId,
      });
    }

    return bot.editMessageText(orderMessages, {
      chat_id: chatId,
      message_id: messageId,
      ...(options as TelegramBot.EditMessageTextOptions),
    });
  } catch (error) {
    console.error("Error in editOrdersMessage: ", error);
  } finally {
    await closeDB();
  }
};

const DownloadOrders = async (bot: TelegramBot, chatId: number) => {
  const admins = getOrderedAdmins();

  try {
    const db = await getDB();
    const orders = db.collection("orders");
    const products = db.collection("products");
    const tenants = await Tenants(admins);
    const tenant = tenants[chatId];

    // Inform user that processing has started
    await bot.sendMessage(
      chatId,
      "Начинается процесс заказа. Это может быть момент для больших данных..."
    );
    await bot.sendChatAction(chatId, "upload_document");

    // Use pagination to handle large datasets
    const BATCH_SIZE = 200;
    let currentPage = 0;
    let hasMore = true;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Orders");

    // Setup columns
    worksheet.columns = [
      { header: "Имя", key: "name", width: 15 },
      { header: "Телефон Номер", key: "phone", width: 15 },
      { header: "Местоположение", key: "location", width: 20 },
      { header: "Имя в Telegram", key: "telegramUsername", width: 20 },
      { header: "Номер", key: "carPartIds", width: 25 },
      { header: "Наименование", key: "productName", width: 20 },
      { header: "Статус", key: "status", width: 15 },
      { header: "Сумма", key: "totalAmount", width: 15 },
      { header: "Itogo", key: "inStock", width: 15 },
    ];

    // Set header row style
    const headerRow = worksheet.getRow(1);
    const columnsToStyle = [
      "name",
      "phone",
      "location",
      "telegramUsername",
      "carPartIds",
      "productName",
      "status",
      "totalAmount",
      "inStock",
    ];

    columnsToStyle.forEach((key) => {
      const column = worksheet.getColumn(key);
      column.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
        if (rowNumber === 1) {
          cell.font = { bold: true, color: { argb: "FFFFFF" } };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "346754" },
          };
        }
      });
    });

    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });

    // Pre-fetch all products to avoid repeated database calls
    const productMap: { [key: string]: any } = {};
    const allProducts = await products.find().toArray();
    allProducts.forEach((product) => {
      productMap[product._id.toString()] = product;
    });

    // Customer tracking to handle pagination
    const processedCustomers = new Set();
    let rowIndex = 2; // Start after header

    while (hasMore) {
      // Get orders in batches
      const userOrders = await orders
        .find(tenant ? { tenantId: tenant._id } : {})
        .skip(currentPage * BATCH_SIZE)
        .limit(BATCH_SIZE)
        .toArray();

      if (userOrders.length === 0) {
        if (currentPage === 0) {
          await bot.sendMessage(chatId, "У вас нет заказов.");
          return;
        }
        break;
      } else if (userOrders.length < BATCH_SIZE) {
        hasMore = false;
      }

      // Group orders by customer
      const customerOrders: { [key: string]: any[] } = {};

      userOrders.forEach((order: any) => {
        const customerKey = `${order.name}-${order.phone}-${order.totalAmount}`;

        if (!customerOrders[customerKey]) {
          customerOrders[customerKey] = [];
        }

        customerOrders[customerKey].push(order);
      });

      // Process each customer group
      for (const [customerKey, orders] of Object.entries(customerOrders)) {
        // Skip customers we've already processed in previous batches
        if (processedCustomers.has(customerKey)) {
          continue;
        }
        processedCustomers.add(customerKey);

        // Get customer info from first order
        const firstOrder = orders[0];
        const customerInfo = {
          name: firstOrder.name,
          phone: firstOrder.phone,
          location: firstOrder.location,
          telegramUsername: firstOrder.telegramUsername,
          totalAmount: firstOrder.totalAmount,
        };

        // Track all items across all orders for this customer
        const allCustomerItems: any[] = [];

        orders.forEach((order) => {
          if (!order.items || !Array.isArray(order.items)) {
            // Handle potential data issues
            console.warn(`Order without items array: ${order._id}`);
            return;
          }

          order.items.forEach((item: any) => {
            const product = productMap[item.productId] || {};
            allCustomerItems.push({
              carPartIds:
                product.carPartIds && product.carPartIds.length > 0
                  ? product.carPartIds.length > 1
                    ? product.carPartIds.join(", ")
                    : product.carPartIds[0]
                  : "",
              productName: item.name,
              status: order.status,
              inStock: product.inStock || 0,
            });
          });
        });

        // Add rows for this customer
        if (allCustomerItems.length > 0) {
          const firstRow = worksheet.addRow({
            name: customerInfo.name,
            phone: customerInfo.phone,
            location: customerInfo.location,
            telegramUsername: customerInfo.telegramUsername,
            totalAmount: customerInfo.totalAmount,
            ...allCustomerItems[0],
          });

          firstRow.eachCell({ includeEmpty: true }, (cell) => {
            cell.border = {
              top: { style: "thin" },
              left: { style: "thin" },
              bottom: { style: "thin" },
              right: { style: "thin" },
            };
          });

          rowIndex++;

          for (let i = 1; i < allCustomerItems.length; i++) {
            const itemRow = worksheet.addRow({
              name: "",
              phone: "",
              location: "",
              telegramUsername: "",
              totalAmount: "",
              ...allCustomerItems[i],
            });

            itemRow.eachCell({ includeEmpty: true }, (cell) => {
              cell.border = {
                top: { style: "thin" },
                left: { style: "thin" },
                bottom: { style: "thin" },
                right: { style: "thin" },
              };
            });

            rowIndex++;
          }

          worksheet.addRow({});
          rowIndex++;
        }
      }

      currentPage++;

      // Notify the user of progress for very large datasets
      if (currentPage % 5 === 0 && hasMore) {
        await bot.sendChatAction(chatId, "upload_document");
      }
    }

    // File may be large - optimize memory usage
    const filePath = path.join(__dirname, `orders_${Date.now()}.xlsx`);

    // Progress update
    await bot.sendMessage(
      chatId,
      "Обработка завершена. Генерация файла Excel..."
    );

    // Use streaming to write the file to avoid memory issues with large files
    await workbook.xlsx.writeFile(filePath);

    await bot.sendDocument(chatId, filePath);
    fs.unlinkSync(filePath); // Delete the file after sending
    return;
  } catch (error) {
    console.error("Error in handleDownloadOrders:", error);
    await bot.sendMessage(
      chatId,
      "Произошла ошибка при обработке ваших заказов. Повторите попытку позже."
    );
  } finally {
    await closeDB();
  }
};

const UpdateOrderStatus = async (
  bot: TelegramBot,
  chatId: string,
  orderId: string,
  status: "cancelled" | "delivered" = "cancelled"
) => {
  try {
    const db = await getDB();
    const orders = db.collection("orders");

    const order = await orders.findOne({ _id: new ObjectId(orderId) });
    if (order?.status === "cancelled" || order?.status === "delivered") {
      await bot.sendMessage(
        chatId,
        `Заказ уже ${order.status === "cancelled" ? "отменен" : "доставлен"}.`
      );
      return;
    }

    await orders.updateOne(
      { _id: new ObjectId(orderId) },
      { $set: { status } }
    );

    await bot.sendMessage(
      chatId,
      `Заказ ${
        status === "cancelled" ? "Отменен" : "Выполнен"
      }. (\`${orderId}\`)`,
      { parse_mode: "Markdown" }
    );
    return;
  } catch (error) {
    console.error("Error in UpdateOrderStatus: ", error);
  } finally {
    await closeDB();
  }
};

export { Orders, UpdateOrderStatus, editOrdersMessage, DownloadOrders };
