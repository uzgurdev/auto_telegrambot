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

// Function to escape special Markdown characters in user input
const escapeMarkdown = (text: string): string => {
  if (!text) return "";
  // Escape special Markdown characters
  return text.replace(/[*_`\[\]()~>#+=|{}.!-]/g, "\\$&");
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
      return `• *${escapeMarkdown(item.name)}* *${escapeMarkdown(
        item.carPartIds?.join(", ") || ""
      )}*\n  💲Цена: *${escapeMarkdown(readablePrice)}*\n  📦Количество: *${
        item.quantity
      }*`;
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
    : `🗓️ *${isKZT ? "Дата" : "Sana"}:* ${escapeMarkdown(formattedDate)}`;

  // Return a single, consistent string (Markdown)
  const readableTotalAmount = readablePriceNumber(
    order.totalAmount,
    order.currency,
    isKZT ? "kz" : "en"
  );

  return `${header}
👤 *${isKZT ? "Имя" : "Ismi"}:* ${escapeMarkdown(order.name)}
📱 *${isKZT ? "Тел" : "Tel"}:* ${escapeMarkdown(order.phone)}
📍 *${isKZT ? "Адрес" : "Manzil"}:* ${escapeMarkdown(order.location)}
💬 *Telegram:* ${escapeMarkdown(order.telegramUsername)}

🛒 *${isKZT ? "Запчасти" : "Ehtiyot qisimlar"}:*
        ${itemsText}

💰 *${isKZT ? "Общая Сумма" : "Umumiy Summa"}:* ${escapeMarkdown(
    readableTotalAmount
  )}
🚚 *${isKZT ? "Статус" : "Holati"}:* ${escapeMarkdown(order.status)}
🆔 *${isKZT ? "ID Заказа" : "Buyurtma ID"}:* \`${escapeMarkdown(
    order._id.toString()
  )}\`
`;
}

export { formatOrderMessage };
