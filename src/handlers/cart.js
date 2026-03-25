const { Markup } = require('telegraf');
const Cart = require('../models/cart');
const Order = require('../models/order');
const Location = require('../models/location');
const { formatPrice } = require('../utils/helpers');
const { mainKeyboard } = require('../keyboards/main');

function setupCartHandler(bot) {
  bot.hears('Корзина', async (ctx) => {
    await showCart(ctx);
  });

  bot.action('show_cart', async (ctx) => {
    ctx.answerCbQuery();
    await showCart(ctx);
  });

  bot.action(/^cart_plus_(\d+)$/, async (ctx) => {
    const menuItemId = parseInt(ctx.match[1]);
    await Cart.addItem(ctx.from.id, menuItemId, 1);
    ctx.answerCbQuery('Добавлено');
    await showCart(ctx);
  });

  bot.action(/^cart_minus_(\d+)$/, async (ctx) => {
    const menuItemId = parseInt(ctx.match[1]);
    const cartItems = await Cart.getCart(ctx.from.id);
    const item = cartItems.find(i => i.menu_item_id === menuItemId);
    if (item) {
      await Cart.updateQty(ctx.from.id, menuItemId, item.quantity - 1);
    }
    ctx.answerCbQuery('Убрано');
    await showCart(ctx);
  });

  bot.action('cart_clear', async (ctx) => {
    await Cart.clear(ctx.from.id);
    ctx.answerCbQuery('Корзина очищена');
    ctx.reply('Корзина очищена.', mainKeyboard(ctx.state.user.role));
  });

  // Checkout
  bot.action('cart_checkout', async (ctx) => {
    ctx.answerCbQuery();
    const cartItems = await Cart.getCart(ctx.from.id);
    if (!cartItems.length) return ctx.reply('Корзина пуста.');

    const locations = await Location.getUserLocations(ctx.from.id);

    if (!locations.length) {
      bot.context = bot.context || {};
      bot.context[ctx.from.id] = { action: 'checkout_new_location', step: 'name' };
      return ctx.reply('У вас нет сохранённых адресов. Введите название места (например "Офис"):');
    }

    const buttons = locations.map(loc =>
      [Markup.button.callback(`${loc.name} — ${loc.address}`, `checkout_loc_${loc.id}`)]
    );
    buttons.push([Markup.button.callback('Новый адрес', 'checkout_new_loc')]);

    ctx.reply('Выберите адрес доставки:', Markup.inlineKeyboard(buttons));
  });

  bot.action(/^checkout_loc_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const locationId = parseInt(ctx.match[1]);
    await processOrder(ctx, bot, locationId);
  });

  bot.action('checkout_new_loc', (ctx) => {
    ctx.answerCbQuery();
    bot.context = bot.context || {};
    bot.context[ctx.from.id] = { action: 'checkout_new_location', step: 'name' };
    ctx.reply('Введите название места (например "Офис"):');
  });

  // Confirm order
  bot.action(/^order_confirm_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    const order = await Order.getWithItems(orderId);
    if (!order) return ctx.reply('Заказ не найден.');

    await Order.setStatus(orderId, 'confirmed');
    await notifyCook(ctx, bot, order);

    ctx.reply(
      `Заказ #${orderId} оформлен! Оплата при получении.\nОжидайте — повар начнёт готовить.`,
      mainKeyboard(ctx.state.user.role)
    );
  });

  bot.action(/^order_cancel_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    await Order.setStatus(orderId, 'cancelled');
    ctx.reply(`Заказ #${orderId} отменён.`, mainKeyboard(ctx.state.user.role));
  });

  // Message handler for checkout flow
  bot.on('message', async (ctx, next) => {
    const pending = bot.context?.[ctx.from.id];
    if (!pending || pending.action !== 'checkout_new_location') return next();

    if (pending.step === 'name') {
      pending.locationName = ctx.message.text;
      pending.step = 'address';
      ctx.reply('Введите адрес доставки:');
    } else if (pending.step === 'address') {
      const locId = await Location.add(ctx.from.id, pending.locationName, ctx.message.text);
      delete bot.context[ctx.from.id];
      await processOrder(ctx, bot, locId);
    }
  });
}

async function showCart(ctx) {
  const items = await Cart.getCart(ctx.from.id);
  if (!items.length) {
    return ctx.reply('Корзина пуста. Загляните в "Меню на сегодня"!');
  }

  let text = '<b>Корзина:</b>\n\n';
  const buttons = [];

  items.forEach(item => {
    text += `<b>${item.name}</b> x${item.quantity} = ${formatPrice(item.price * item.quantity)}\n`;
    buttons.push([
      Markup.button.callback('➖', `cart_minus_${item.menu_item_id}`),
      Markup.button.callback(`${item.name}: ${item.quantity}`, 'noop'),
      Markup.button.callback('➕', `cart_plus_${item.menu_item_id}`)
    ]);
  });

  const { total } = await Cart.getTotal(ctx.from.id);
  text += `\n<b>Итого: ${formatPrice(total)}</b>`;

  buttons.push([
    Markup.button.callback('Оформить заказ', 'cart_checkout'),
    Markup.button.callback('Очистить', 'cart_clear')
  ]);

  ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

async function processOrder(ctx, bot, locationId) {
  const cartItems = await Cart.getCart(ctx.from.id);
  if (!cartItems.length) return ctx.reply('Корзина пуста.');

  const orderId = await Order.create(ctx.from.id, locationId, null);

  for (const item of cartItems) {
    await Order.addItem(orderId, item.menu_item_id, item.quantity, item.price);
  }

  await Order.updateTotal(orderId);
  await Cart.clear(ctx.from.id);

  const order = await Order.getWithItems(orderId);
  const location = await Location.getById(locationId);

  let text = `<b>Заказ #${orderId}</b>\n\n`;
  order.items.forEach(item => {
    text += `${item.name} x${item.quantity} = ${formatPrice(item.price * item.quantity)}\n`;
  });
  text += `\n<b>Итого: ${formatPrice(order.total)}</b>`;
  text += `\nДоставка: ${location.name} — ${location.address}`;
  text += `\nОплата при получении`;

  ctx.reply(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Подтвердить', `order_confirm_${orderId}`)],
      [Markup.button.callback('Отменить', `order_cancel_${orderId}`)]
    ])
  });
}

async function notifyCook(ctx, bot, order) {
  const cookChatId = process.env.COOK_CHAT_ID;
  if (!cookChatId) return;

  let text = `<b>НОВЫЙ ЗАКАЗ #${order.id}</b>\n\n`;
  text += `Клиент: ${order.first_name || ''} ${order.last_name || ''}`;
  if (order.username) text += ` (@${order.username})`;
  if (order.phone) text += `\nТел: ${order.phone}`;
  text += `\nАдрес: ${order.location_name || ''} — ${order.location_address || ''}`;
  text += `\n\nБлюда:\n`;

  order.items.forEach(item => {
    text += `  - ${item.name} x${item.quantity}\n`;
  });

  text += `\n<b>Итого: ${formatPrice(order.total)}</b>`;

  bot.telegram.sendMessage(cookChatId, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Начать готовить', `cook_start_${order.id}`)],
      [Markup.button.callback('Готово', `cook_ready_${order.id}`)],
      [Markup.button.callback('Доставлено', `cook_delivered_${order.id}`)]
    ])
  }).catch(() => {});
}

module.exports = { setupCartHandler };
