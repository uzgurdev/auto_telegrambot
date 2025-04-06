import { Order } from "types";

const readablePriceNumber = (
  price: number,
  currency: string,
  tenant: string
): string => {
  return (
    price.toLocaleString(`${tenant.toLowerCase()}-${tenant.toUpperCase()}`, {
      style: "decimal",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + ` ${currency}`
  );
};

function formatOrderMessage(order: Order): string {
  const isKZT = order.currency === "KZT";

  // Build a readable list of items
  const itemsText = order.items
    .map((item) => {
      const readablePrice = readablePriceNumber(
        item.price,
        order.currency,
        isKZT ? "kz" : "en"
      );
      return isKZT
        ? `• *${item.name}*\n  💲Цена: *${readablePrice}*\n  📦Количество: *${item.quantity}*`
        : `• *${item.name}*\n  💲Narhi: *${readablePrice}*\n  📦Soni: *${item.quantity}*`;
    })
    .join("\n\n");

  const formattedDate = new Date(order.createdAt).toLocaleDateString(
    isKZT ? "ru-RU" : "uz-UZ",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
    }
  );

  // Determine the header based on whether the order is new
  const header = order.isNew
    ? isKZT
      ? "🔔 *Новый Заказ* 🔔"
      : "🔔 *Yangi Buyurtma* 🔔"
    : `🗓️ *${isKZT ? "Дата" : "Sana"}:* ${formattedDate}`;

  // Return a single, consistent string (Markdown)
  const readableTotalAmount = readablePriceNumber(
    order.totalAmount,
    order.currency,
    isKZT ? "kz" : "en"
  );

  return `${header}
👤 *${isKZT ? "Имя" : "Ismi"}:* ${order.name}
📱 *${isKZT ? "Тел" : "Tel"}:* ${order.phone}
📍 *${isKZT ? "Адрес" : "Manzil"}:* ${order.location}
💬 *Telegram:* ${order.telegramUsername}

🛒 *${isKZT ? "Запчасти" : "Ehtiyot qisimlar"}:*
        ${itemsText}

💰 *${isKZT ? "Общая Сумма" : "Umumiy Summa"}:* ${readableTotalAmount}
🚚 *${isKZT ? "Статус" : "Holati"}:* ${order.status}
🆔 *${isKZT ? "ID Заказа" : "Buyurtma ID"}:* \`${order._id}\`
`;
}

export { formatOrderMessage };
