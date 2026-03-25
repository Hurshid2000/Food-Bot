const { Markup } = require('telegraf');
const Order = require('../models/order');
const { isAdmin, isCook } = require('../middleware/auth');
const { formatPrice, formatOrderStatus } = require('../utils/helpers');
const { mainKeyboard } = require('../keyboards/main');

function setupOrdersHandler(bot) {
  // User: my orders
  bot.hears('Мои заказы', (ctx) => {
    const orders = Order.getUserOrders(ctx.from.id);
    if (!orders.length) return ctx.reply('У вас пока нет заказов.');

    let text = '<b>Ваши заказы:</b>\n\n';
    orders.forEach(order => {
      text += `#${order.id} — ${formatOrderStatus(order.status)} — ${formatPrice(order.total)} (${order.created_at})\n`;
    });

    const buttons = orders.slice(0, 5).map(o =>
      [Markup.button.callback(`Заказ #${o.id}`, `order_details_${o.id}`)]
    );

    ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  });

  // Order details
  bot.action(/^order_details_(\d+)$/, (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    const order = Order.getWithItems(orderId);
    if (!order) return ctx.reply('Заказ не найден.');

    let text = `<b>Заказ #${order.id}</b>\n`;
    text += `Статус: ${formatOrderStatus(order.status)}\n`;
    text += `Дата: ${order.created_at}\n`;
    if (order.location_name) text += `Адрес: ${order.location_name} — ${order.location_address}\n`;
    text += `\nБлюда:\n`;

    order.items.forEach(item => {
      text += `  • ${item.name} x${item.quantity} = ${formatPrice(item.price * item.quantity)}\n`;
    });
    text += `\n<b>Итого: ${formatPrice(order.total)}</b>`;

    const buttons = [];
    if (order.status === 'delivered') {
      buttons.push([Markup.button.callback('Оставить отзыв', `review_order_${order.id}`)]);
    }

    ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  });

  // Admin/Cook: active orders
  bot.hears('Активные заказы', (ctx) => {
    if (!isAdmin(ctx) && !isCook(ctx)) return ctx.reply('Нет доступа.');

    const orders = Order.getActiveOrders();
    if (!orders.length) return ctx.reply('Нет активных заказов.');

    orders.forEach(order => {
      const full = Order.getWithItems(order.id);
      let text = `<b>Заказ #${order.id}</b> [${formatOrderStatus(order.status)}]\n`;
      text += `Клиент: ${order.first_name || ''} ${order.last_name || ''}`;
      if (order.username) text += ` (@${order.username})`;
      if (order.phone) text += `\nТел: ${order.phone}`;
      if (order.location_name) text += `\nАдрес: ${order.location_name} — ${order.location_address}`;
      text += `\n\nБлюда:\n`;
      full.items.forEach(item => {
        text += `  • ${item.name} x${item.quantity}\n`;
      });
      text += `\n<b>Итого: ${formatPrice(order.total)}</b>`;

      ctx.reply(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('Готовится', `cook_start_${order.id}`),
            Markup.button.callback('Готово', `cook_ready_${order.id}`),
          ],
          [
            Markup.button.callback('Доставлено', `cook_delivered_${order.id}`),
            Markup.button.callback('Отменить', `cook_cancel_${order.id}`)
          ]
        ])
      });
    });
  });

  // Cook actions
  bot.action(/^cook_start_(\d+)$/, (ctx) => {
    if (!isAdmin(ctx) && !isCook(ctx)) return;
    const orderId = parseInt(ctx.match[1]);
    Order.setStatus(orderId, 'cooking');
    ctx.answerCbQuery(`Заказ #${orderId}: готовится`);
    notifyUser(bot, orderId, 'cooking');
  });

  bot.action(/^cook_ready_(\d+)$/, (ctx) => {
    if (!isAdmin(ctx) && !isCook(ctx)) return;
    const orderId = parseInt(ctx.match[1]);
    Order.setStatus(orderId, 'ready');
    ctx.answerCbQuery(`Заказ #${orderId}: готов`);
    notifyUser(bot, orderId, 'ready');
  });

  bot.action(/^cook_delivered_(\d+)$/, (ctx) => {
    if (!isAdmin(ctx) && !isCook(ctx)) return;
    const orderId = parseInt(ctx.match[1]);
    Order.setStatus(orderId, 'delivered');
    ctx.answerCbQuery(`Заказ #${orderId}: доставлен`);
    notifyUser(bot, orderId, 'delivered');
  });

  bot.action(/^cook_cancel_(\d+)$/, (ctx) => {
    if (!isAdmin(ctx) && !isCook(ctx)) return;
    const orderId = parseInt(ctx.match[1]);
    Order.setStatus(orderId, 'cancelled');
    ctx.answerCbQuery(`Заказ #${orderId}: отменён`);
    notifyUser(bot, orderId, 'cancelled');
  });

  bot.action('noop', (ctx) => ctx.answerCbQuery());
}

function notifyUser(bot, orderId, status) {
  const order = Order.getById(orderId);
  if (!order) return;

  const statusMessages = {
    cooking: `Ваш заказ #${orderId} готовится!`,
    ready: `Ваш заказ #${orderId} готов! Ожидайте доставку.`,
    delivered: `Ваш заказ #${orderId} доставлен! Приятного аппетита!\n\nОставьте отзыв в разделе "Мои заказы".`,
    cancelled: `Ваш заказ #${orderId} отменён.`
  };

  const text = statusMessages[status];
  if (text) {
    bot.telegram.sendMessage(order.user_id, text).catch(() => {});
  }
}

module.exports = { setupOrdersHandler };
