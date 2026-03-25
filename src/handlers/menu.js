const { Markup } = require('telegraf');
const Menu = require('../models/menu');
const Cart = require('../models/cart');
const { isAdmin } = require('../middleware/auth');
const { getToday, formatPrice, formatNutrition, formatDate } = require('../utils/helpers');
const { mainKeyboard } = require('../keyboards/main');

function setupMenuHandler(bot) {
  // === View today's menu (all users) ===
  bot.hears('Меню на сегодня', (ctx) => {
    const today = getToday();
    const items = Menu.getDailyMenu(today);

    if (!items.length) {
      return ctx.reply('Меню на сегодня пока не добавлено.');
    }

    items.forEach(item => {
      const nutrition = formatNutrition(item);
      const text = `<b>${item.name}</b>\n${item.description || ''}\n\n` +
        `Цена: ${formatPrice(item.price)}\n` +
        (nutrition ? `${nutrition}\n` : '') +
        `Осталось: ${item.available_qty} порций`;

      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('В корзину', `add_to_cart_${item.id}`)
      ]);

      if (item.photo_id) {
        ctx.replyWithPhoto(item.photo_id, { caption: text, parse_mode: 'HTML', ...keyboard });
      } else {
        ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    });
  });

  // Add to cart
  bot.action(/^add_to_cart_(\d+)$/, (ctx) => {
    const dailyMenuId = parseInt(ctx.match[1]);
    const item = Menu.getDailyMenuItem(dailyMenuId);

    if (!item || item.available_qty <= 0) {
      return ctx.answerCbQuery('Это блюдо закончилось!');
    }

    Cart.addItem(ctx.from.id, dailyMenuId, 1);
    ctx.answerCbQuery(`${item.name} добавлено в корзину!`);
  });

  // === Popular dishes ===
  bot.hears('Популярное', (ctx) => {
    const items = Menu.getPopularItems(10);
    if (!items.length) {
      return ctx.reply('Пока нет данных о популярных блюдах.');
    }

    let text = '<b>Популярные блюда:</b>\n\n';
    items.forEach((item, i) => {
      const rating = item.avg_rating ? ` | ${item.avg_rating}/5` : '';
      text += `${i + 1}. <b>${item.name}</b> — ${formatPrice(item.price)} (заказов: ${item.order_count}${rating})\n`;
    });

    ctx.reply(text, { parse_mode: 'HTML' });
  });

  // === Admin: menu management ===
  bot.hears('Управление меню', (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('Нет доступа.');

    ctx.reply('Управление меню:', Markup.inlineKeyboard([
      [Markup.button.callback('Добавить блюдо', 'menu_add')],
      [Markup.button.callback('Список блюд', 'menu_list')],
      [Markup.button.callback('Добавить в меню дня', 'menu_daily_add')],
      [Markup.button.callback('Меню на сегодня (админ)', 'menu_daily_today')]
    ]));
  });

  // Add dish flow
  bot.action('menu_add', (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.answerCbQuery();
    bot.context = bot.context || {};
    bot.context[ctx.from.id] = { action: 'add_dish', step: 'name' };
    ctx.reply('Введите название блюда:');
  });

  // List all dishes
  bot.action('menu_list', (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.answerCbQuery();
    const items = Menu.getAllActive();
    if (!items.length) return ctx.reply('Блюд пока нет.');

    let text = '<b>Все блюда:</b>\n\n';
    items.forEach(item => {
      text += `[${item.id}] <b>${item.name}</b> — ${formatPrice(item.price)}\n`;
    });
    text += '\nДля удаления используйте: /delete_dish_ID';
    ctx.reply(text, { parse_mode: 'HTML' });
  });

  // Delete dish
  bot.hears(/^\/delete_dish_(\d+)$/, (ctx) => {
    if (!isAdmin(ctx)) return;
    const id = parseInt(ctx.match[1]);
    Menu.deleteItem(id);
    ctx.reply('Блюдо удалено из меню.');
  });

  // Add to daily menu
  bot.action('menu_daily_add', (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.answerCbQuery();
    const items = Menu.getAllActive();
    if (!items.length) return ctx.reply('Сначала добавьте блюда.');

    const buttons = items.map(item =>
      [Markup.button.callback(`${item.name} — ${formatPrice(item.price)}`, `daily_select_${item.id}`)]
    );
    ctx.reply('Выберите блюдо для добавления в меню дня:', Markup.inlineKeyboard(buttons));
  });

  bot.action(/^daily_select_(\d+)$/, (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.answerCbQuery();
    bot.context = bot.context || {};
    bot.context[ctx.from.id] = {
      action: 'add_daily',
      step: 'date',
      menuItemId: parseInt(ctx.match[1])
    };
    ctx.reply(`Введите дату (ГГГГ-ММ-ДД) или "сегодня":`);
  });

  // Today's daily menu (admin view)
  bot.action('menu_daily_today', (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.answerCbQuery();
    const items = Menu.getDailyMenu(getToday());
    if (!items.length) return ctx.reply('Меню на сегодня пусто.');

    let text = '<b>Меню на сегодня (админ):</b>\n\n';
    items.forEach(item => {
      text += `[${item.id}] <b>${item.name}</b> — ${formatPrice(item.price)} (осталось: ${item.available_qty})\n`;
    });
    text += '\nДля удаления из дневного меню: /remove_daily_ID';
    ctx.reply(text, { parse_mode: 'HTML' });
  });

  bot.hears(/^\/remove_daily_(\d+)$/, (ctx) => {
    if (!isAdmin(ctx)) return;
    Menu.removeFromDaily(parseInt(ctx.match[1]));
    ctx.reply('Блюдо убрано из дневного меню.');
  });

  // === Message handler for multi-step flows ===
  bot.on('message', (ctx, next) => {
    if (!isAdmin(ctx)) return next();
    const pending = bot.context?.[ctx.from.id];
    if (!pending) return next();

    // Add dish flow
    if (pending.action === 'add_dish') {
      return handleAddDishFlow(ctx, bot, pending);
    }

    // Add to daily menu flow
    if (pending.action === 'add_daily') {
      return handleAddDailyFlow(ctx, bot, pending);
    }

    return next();
  });
}

function handleAddDishFlow(ctx, bot, pending) {
  const msg = ctx.message;

  switch (pending.step) {
    case 'name':
      pending.name = msg.text;
      pending.step = 'description';
      ctx.reply('Введите описание (или "-" чтобы пропустить):');
      break;

    case 'description':
      pending.description = msg.text === '-' ? null : msg.text;
      pending.step = 'price';
      ctx.reply('Введите цену:');
      break;

    case 'price':
      const price = parseFloat(msg.text);
      if (isNaN(price) || price <= 0) return ctx.reply('Введите корректную цену:');
      pending.price = price;
      pending.step = 'photo';
      ctx.reply('Отправьте фото блюда (или "-" чтобы пропустить):');
      break;

    case 'photo':
      if (msg.photo) {
        pending.photo_id = msg.photo[msg.photo.length - 1].file_id;
      } else if (msg.text === '-') {
        pending.photo_id = null;
      } else {
        return ctx.reply('Отправьте фото или "-" чтобы пропустить:');
      }
      pending.step = 'nutrition';
      ctx.reply('Введите КБЖУ через пробел (калории белки жиры углеводы) или "-" чтобы пропустить:\nПример: 350 30 10 25');
      break;

    case 'nutrition':
      if (msg.text !== '-') {
        const parts = msg.text.split(/\s+/).map(Number);
        if (parts.length === 4 && parts.every(n => !isNaN(n))) {
          [pending.calories, pending.proteins, pending.fats, pending.carbs] = parts;
        } else {
          return ctx.reply('Введите 4 числа через пробел или "-":');
        }
      }

      const id = Menu.addItem({
        name: pending.name,
        description: pending.description,
        price: pending.price,
        photo_id: pending.photo_id,
        calories: pending.calories || null,
        proteins: pending.proteins || null,
        fats: pending.fats || null,
        carbs: pending.carbs || null
      });

      ctx.reply(
        `Блюдо "${pending.name}" добавлено (ID: ${id})!\n\nЦена: ${formatPrice(pending.price)}`,
        mainKeyboard(ctx.state.user.role)
      );
      delete bot.context[ctx.from.id];
      break;
  }
}

function handleAddDailyFlow(ctx, bot, pending) {
  const msg = ctx.message;

  switch (pending.step) {
    case 'date':
      const dateText = msg.text.trim().toLowerCase();
      if (dateText === 'сегодня') {
        pending.date = getToday();
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
        pending.date = dateText;
      } else {
        return ctx.reply('Введите дату в формате ГГГГ-ММ-ДД или "сегодня":');
      }
      pending.step = 'qty';
      ctx.reply('Сколько порций доступно?');
      break;

    case 'qty':
      const qty = parseInt(msg.text);
      if (isNaN(qty) || qty <= 0) return ctx.reply('Введите число порций:');

      Menu.addToDaily(pending.menuItemId, pending.date, qty);
      const item = Menu.getItem(pending.menuItemId);
      ctx.reply(
        `"${item.name}" добавлено в меню на ${formatDate(pending.date)} (${qty} порций).`,
        mainKeyboard(ctx.state.user.role)
      );
      delete bot.context[ctx.from.id];
      break;
  }
}

module.exports = { setupMenuHandler };
