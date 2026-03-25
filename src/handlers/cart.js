const { Markup } = require('telegraf');
const Cart = require('../models/cart');
const Order = require('../models/order');
const Menu = require('../models/menu');
const Location = require('../models/location');
const { formatPrice } = require('../utils/helpers');
const { mainKeyboard } = require('../keyboards/main');

function setupCartHandler(bot) {
  bot.hears('Корзина', (ctx) => {
    showCart(ctx);
  });

  bot.action('show_cart', (ctx) => {
    ctx.answerCbQuery();
    showCart(ctx);
  });

  bot.action(/^cart_plus_(\d+)$/, (ctx) => {
    const dailyMenuId = parseInt(ctx.match[1]);
    Cart.addItem(ctx.from.id, dailyMenuId, 1);
    ctx.answerCbQuery('Добавлено');
    showCart(ctx);
  });

  bot.action(/^cart_minus_(\d+)$/, (ctx) => {
    const dailyMenuId = parseInt(ctx.match[1]);
    const cartItems = Cart.getCart(ctx.from.id);
    const item = cartItems.find(i => i.daily_menu_id === dailyMenuId);
    if (item) {
      Cart.updateQty(ctx.from.id, dailyMenuId, item.quantity - 1);
    }
    ctx.answerCbQuery('Убрано');
    showCart(ctx);
  });

  bot.action('cart_clear', (ctx) => {
    Cart.clear(ctx.from.id);
    ctx.answerCbQuery('Корзина очищена');
    ctx.reply('Корзина очищена.', mainKeyboard(ctx.state.user.role));
  });

  // Checkout
  bot.action('cart_checkout', (ctx) => {
    ctx.answerCbQuery();
    const cartItems = Cart.getCart(ctx.from.id);
    if (!cartItems.length) return ctx.reply('Корзина пуста.');

    const locations = Location.getUserLocations(ctx.from.id);

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

  bot.action(/^checkout_loc_(\d+)$/, (ctx) => {
    ctx.answerCbQuery();
    const locationId = parseInt(ctx.match[1]);
    processOrder(ctx, bot, locationId);
  });

  bot.action('checkout_new_loc', (ctx) => {
    ctx.answerCbQuery();
    bot.context = bot.context || {};
    bot.context[ctx.from.id] = { action: 'checkout_new_location', step: 'name' };
    ctx.reply('Введите название места (например "Офис"):');
  });

  // Note before final confirm
  bot.action(/^order_confirm_(\d+)$/, (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    const order = Order.getWithItems(orderId);
    if (!order) return ctx.reply('Заказ не найден.');

    Order.setStatus(orderId, 'confirmed');

    // Notify cook
    notifyCook(ctx, bot, order);

    ctx.reply(
      `Заказ #${orderId} оформлен! Оплата при получении.\nОжидайте — повар начнёт готовить.`,
      mainKeyboard(ctx.state.user.role)
    );
  });

  bot.action(/^order_cancel_(\d+)$/, (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    Order.setStatus(orderId, 'cancelled');
    ctx.reply(`Заказ #${orderId} отменён.`, mainKeyboard(ctx.state.user.role));
  });

  // Message handler for checkout flow
  bot.on('message', (ctx, next) => {
    const pending = bot.context?.[ctx.from.id];
    if (!pending || pending.action !== 'checkout_new_location') return next();

    if (pending.step === 'name') {
      pending.locationName = ctx.message.text;
      pending.step = 'address';
      ctx.reply('Введите адрес доставки:');
    } else if (pending.step === 'address') {
      const locId = Location.add(ctx.from.id, pending.locationName, ctx.message.text);
      delete bot.context[ctx.from.id];
      processOrder(ctx, bot, locId);
    }
  });
}

function showCart(ctx) {
  const items = Cart.getCart(ctx.from.id);
  if (!items.length) {
    return ctx.reply('Корзина пуста. Загляните в "Меню на сегодня"!');
  }

  let text = '<b>Корзина:</b>\n\n';
  const buttons = [];

  items.forEach(item => {
    text += `<b>${item.name}</b> x${item.quantity} = ${formatPrice(item.price * item.quantity)}\n`;
    buttons.push([
      Markup.button.callback(`➖`, `cart_minus_${item.daily_menu_id}`),
      Markup.button.callback(`${item.name}: ${item.quantity}`, `noop`),
      Markup.button.callback(`➕`, `cart_plus_${item.daily_menu_id}`)
    ]);
  });

  const { total } = Cart.getTotal(ctx.from.id);
  text += `\n<b>Итого: ${formatPrice(total)}</b>`;

  buttons.push([
    Markup.button.callback('Оформить заказ', 'cart_checkout'),
    Markup.button.callback('Очистить', 'cart_clear')
  ]);

  ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

function processOrder(ctx, bot, locationId) {
  const cartItems = Cart.getCart(ctx.from.id);
  if (!cartItems.length) return ctx.reply('Корзина пуста.');

  // Check availability
  for (const item of cartItems) {
    if (item.quantity > item.available_qty) {
      return ctx.reply(`"${item.name}" — доступно только ${item.available_qty} порций. Уменьшите количество.`);
    }
  }

  // Create order
  const orderId = Order.create(ctx.from.id, locationId, null);

  for (const item of cartItems) {
    Order.addItem(orderId, item.daily_menu_id, item.quantity, item.price);
    Menu.decrementQty(item.daily_menu_id, item.quantity);
  }

  Order.updateTotal(orderId);
  Cart.clear(ctx.from.id);

  const order = Order.getWithItems(orderId);
  const location = Location.getById(locationId);

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

function notifyCook(ctx, bot, order) {
  const cookChatId = process.env.COOK_CHAT_ID;
  if (!cookChatId) return;

  let text = `🍳 <b>НОВЫЙ ЗАКАЗ #${order.id}</b>\n\n`;
  text += `Клиент: ${order.first_name || ''} ${order.last_name || ''}`;
  if (order.username) text += ` (@${order.username})`;
  if (order.phone) text += `\nТел: ${order.phone}`;
  text += `\nАдрес: ${order.location_name || ''} — ${order.location_address || ''}`;
  text += `\n\nБлюда:\n`;

  order.items.forEach(item => {
    text += `  • ${item.name} x${item.quantity}\n`;
  });

  text += `\n<b>Итого: ${formatPrice(order.total)}</b>`;

  bot.telegram.sendMessage(cookChatId, text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('Начать готовить', `cook_start_${order.id}`)],
      [Markup.button.callback('Готово', `cook_ready_${order.id}`)],
      [Markup.button.callback('Доставлено', `cook_delivered_${order.id}`)]
    ])
  });
}

module.exports = { setupCartHandler };
