const { Markup } = require('telegraf');
const Order = require('../models/order');
const Cart = require('../models/cart');
const Location = require('../models/location');
const { isAdmin, isCook } = require('../middleware/auth');
const { formatPrice, formatOrderStatus } = require('../utils/helpers');
const { mainKeyboard, adminPanelKeyboard } = require('../keyboards/main');

function setupOrdersHandler(bot) {
  // === Client: active orders ===
  bot.hears('Мои заказы', async (ctx) => {
    const allOrders = await Order.getUserOrders(ctx.from.id);
    const orders = allOrders.filter(o => !['delivered', 'cancelled'].includes(o.status));
    if (!orders.length) return ctx.reply('У вас нет активных заказов.');

    let text = '<b>Ваши активные заказы:</b>\n\n';
    orders.forEach(order => {
      text += `#${order.id} — ${formatOrderStatus(order.status)} — ${formatPrice(order.total)}\n`;
    });

    const buttons = orders.slice(0, 5).map(o =>
      [Markup.button.callback(`Заказ #${o.id}`, `order_details_${o.id}`)]
    );

    ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  });

  // === Client: order history ===
  bot.hears('История', async (ctx) => {
    const orders = await Order.getUserHistory(ctx.from.id);
    if (!orders.length) return ctx.reply('У вас пока нет завершённых заказов.');

    let text = '<b>История заказов:</b>\n\n';
    orders.forEach(order => {
      text += `#${order.id} — ${formatOrderStatus(order.status)} — ${formatPrice(order.total)} (${new Date(order.created_at).toLocaleDateString('ru-RU')})\n`;
    });

    const buttons = orders.slice(0, 5).map(o =>
      [Markup.button.callback(`Заказ #${o.id}`, `order_details_${o.id}`)]
    );

    ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  });

  // === Admin: order history (all users) ===
  bot.hears('История заказов', async (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('Нет доступа.');

    const orders = await Order.getAllOrders(30);
    if (!orders.length) return ctx.reply('Заказов пока нет.', adminPanelKeyboard(ctx.state.user.role));

    let text = '<b>История всех заказов:</b>\n\n';
    orders.forEach(order => {
      const name = order.first_name || '';
      const user = order.username ? ` (@${order.username})` : '';
      text += `#${order.id} — ${name}${user} — ${formatOrderStatus(order.status)} — ${formatPrice(order.total)} (${new Date(order.created_at).toLocaleDateString('ru-RU')})\n`;
    });

    const buttons = orders.slice(0, 5).map(o =>
      [Markup.button.callback(`Подробнее #${o.id}`, `order_details_${o.id}`)]
    );

    ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  });

  // Order details
  bot.action(/^order_details_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    await showOrderDetails(ctx, orderId);
  });

  // === Edit order ===
  bot.action(/^order_edit_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    const order = await Order.getById(orderId);

    if (!order || !['new', 'confirmed'].includes(order.status)) {
      return ctx.reply('Этот заказ уже нельзя редактировать.');
    }
    if (order.user_id !== ctx.from.id) return;

    ctx.reply(`Редактирование заказа #${orderId}:`, Markup.inlineKeyboard([
      [Markup.button.callback('Изменить блюда', `order_edit_items_${orderId}`)],
      [Markup.button.callback('Изменить адрес', `order_edit_loc_${orderId}`)],
      [Markup.button.callback('Отменить заказ', `order_cancel_user_${orderId}`)],
      [Markup.button.callback('Назад к заказу', `order_details_${orderId}`)]
    ]));
  });

  bot.action(/^order_edit_items_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    const order = await Order.getWithItems(orderId);

    if (!order || !['new', 'confirmed'].includes(order.status)) {
      return ctx.reply('Этот заказ уже нельзя редактировать.');
    }
    if (order.user_id !== ctx.from.id) return;

    await Cart.clear(ctx.from.id);
    for (const item of order.items) {
      await Cart.addItem(ctx.from.id, item.menu_item_id, item.quantity);
    }

    await Order.setStatus(orderId, 'cancelled');

    ctx.reply(
      `Заказ #${orderId} отменён. Блюда перенесены в корзину — отредактируйте и оформите заново.`,
      mainKeyboard(ctx.state.user.role)
    );
  });

  bot.action(/^order_edit_loc_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    const order = await Order.getById(orderId);

    if (!order || !['new', 'confirmed'].includes(order.status)) {
      return ctx.reply('Этот заказ уже нельзя редактировать.');
    }
    if (order.user_id !== ctx.from.id) return;

    const locations = await Location.getUserLocations(ctx.from.id);
    if (!locations.length) {
      return ctx.reply('У вас нет сохранённых адресов. Добавьте адрес в "Мои адреса".');
    }

    const buttons = locations.map(loc =>
      [Markup.button.callback(`${loc.name} — ${loc.address}`, `order_set_loc_${orderId}_${loc.id}`)]
    );
    buttons.push([Markup.button.callback('Назад', `order_edit_${orderId}`)]);

    ctx.reply('Выберите новый адрес доставки:', Markup.inlineKeyboard(buttons));
  });

  bot.action(/^order_set_loc_(\d+)_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    const locationId = parseInt(ctx.match[2]);
    const order = await Order.getById(orderId);

    if (!order || !['new', 'confirmed'].includes(order.status)) {
      return ctx.reply('Этот заказ уже нельзя редактировать.');
    }

    await Order.updateLocation(orderId, locationId);
    const loc = await Location.getById(locationId);
    ctx.reply(`Адрес заказа #${orderId} изменён на: ${loc.name} — ${loc.address}`);
    await showOrderDetails(ctx, orderId);
  });

  bot.action(/^order_cancel_user_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    const order = await Order.getById(orderId);

    if (!order || !['new', 'confirmed'].includes(order.status)) {
      return ctx.reply('Этот заказ уже нельзя отменить.');
    }
    if (order.user_id !== ctx.from.id) return;

    await Order.setStatus(orderId, 'cancelled');
    ctx.reply(`Заказ #${orderId} отменён.`, mainKeyboard(ctx.state.user.role));
  });

  // === Admin/Cook: active orders ===
  bot.hears('Активные заказы', async (ctx) => {
    if (!isAdmin(ctx) && !isCook(ctx)) return ctx.reply('Нет доступа.');

    await Order.autoCompleteOldOrders();

    const orders = await Order.getActiveOrders();
    if (!orders.length) return ctx.reply('Нет активных заказов.');

    for (const order of orders) {
      const full = await Order.getWithItems(order.id);
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

      await ctx.reply(text, {
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
    }
  });

  // Cook actions
  bot.action(/^cook_start_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx) && !isCook(ctx)) return;
    const orderId = parseInt(ctx.match[1]);
    await Order.setStatus(orderId, 'cooking');
    ctx.answerCbQuery(`Заказ #${orderId}: готовится`);
    notifyUser(bot, orderId, 'cooking');
  });

  bot.action(/^cook_ready_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx) && !isCook(ctx)) return;
    const orderId = parseInt(ctx.match[1]);
    await Order.setStatus(orderId, 'ready');
    ctx.answerCbQuery(`Заказ #${orderId}: готов`);
    notifyUser(bot, orderId, 'ready');
  });

  bot.action(/^cook_delivered_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx) && !isCook(ctx)) return;
    const orderId = parseInt(ctx.match[1]);
    await Order.setStatus(orderId, 'delivered');
    ctx.answerCbQuery(`Заказ #${orderId}: доставлен`);
    notifyUser(bot, orderId, 'delivered');
  });

  bot.action(/^cook_cancel_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx) && !isCook(ctx)) return;
    const orderId = parseInt(ctx.match[1]);
    await Order.setStatus(orderId, 'cancelled');
    ctx.answerCbQuery(`Заказ #${orderId}: отменён`);
    notifyUser(bot, orderId, 'cancelled');
  });

  bot.action('noop', (ctx) => ctx.answerCbQuery());
}

async function showOrderDetails(ctx, orderId) {
  const order = await Order.getWithItems(orderId);
  if (!order) return ctx.reply('Заказ не найден.');

  let text = `<b>Заказ #${order.id}</b>\n`;
  text += `Статус: ${formatOrderStatus(order.status)}\n`;
  text += `Дата: ${new Date(order.created_at).toLocaleDateString('ru-RU')}\n`;
  if (order.location_name) text += `Адрес: ${order.location_name} — ${order.location_address}\n`;
  text += `\nБлюда:\n`;

  order.items.forEach(item => {
    text += `  • ${item.name} x${item.quantity} = ${formatPrice(item.price * item.quantity)}\n`;
  });
  text += `\n<b>Итого: ${formatPrice(order.total)}</b>`;

  const buttons = [];

  if (['new', 'confirmed'].includes(order.status) && order.user_id === ctx.from.id) {
    buttons.push([Markup.button.callback('Редактировать', `order_edit_${order.id}`)]);
    buttons.push([Markup.button.callback('Отменить заказ', `order_cancel_user_${order.id}`)]);
  }

  if (order.status === 'delivered') {
    buttons.push([Markup.button.callback('Оставить отзыв', `review_order_${order.id}`)]);
  }

  ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

async function notifyUser(bot, orderId, status) {
  const order = await Order.getById(orderId);
  if (!order) return;

  const statusMessages = {
    cooking: `Ваш заказ #${orderId} готовится!`,
    ready: `Ваш заказ #${orderId} готов! Ожидайте доставку.`,
    delivered: `Ваш заказ #${orderId} доставлен! Приятного аппетита!\n\nОставьте отзыв в разделе "История".`,
    cancelled: `Ваш заказ #${orderId} отменён.`
  };

  const text = statusMessages[status];
  if (text) {
    bot.telegram.sendMessage(order.user_id, text).catch(() => {});
  }
}

module.exports = { setupOrdersHandler };
