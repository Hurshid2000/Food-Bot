const { Markup } = require('telegraf');
const Menu = require('../models/menu');
const Cart = require('../models/cart');
const { isAdmin } = require('../middleware/auth');
const { getToday, formatPrice, formatNutrition, formatDate, getNextWorkdays, isTodayWorkday } = require('../utils/helpers');
const { mainKeyboard, menuAdminKeyboard } = require('../keyboards/main');

function setupMenuHandler(bot) {
  // === View today's menu (all users) ===
  bot.hears('Меню на сегодня', async (ctx) => {
    if (!isTodayWorkday()) {
      return ctx.reply('Сегодня выходной — заказы принимаются только в рабочие дни (Пн-Пт).');
    }

    const today = getToday();
    const items = await Menu.getDailyMenu(today);

    if (!items.length) {
      return ctx.reply('Меню на сегодня пока не добавлено.');
    }

    for (const item of items) {
      const nutrition = formatNutrition(item);
      const daily = item.is_daily ? ' [ежедневное]' : '';
      const text = `<b>${item.name}</b>${daily}\n${item.description || ''}\n\n` +
        `Цена: ${formatPrice(item.price)}\n` +
        (nutrition ? `${nutrition}\n` : '');

      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback('В корзину', `add_to_cart_${item.id}`)
      ]);

      if (item.photo_id) {
        await ctx.replyWithPhoto(item.photo_id, { caption: text, parse_mode: 'HTML', ...keyboard });
      } else {
        await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    }
  });

  // Add to cart
  bot.action(/^add_to_cart_(\d+)$/, async (ctx) => {
    const menuItemId = parseInt(ctx.match[1]);
    const item = await Menu.getItem(menuItemId);

    if (!item || !item.is_active) {
      return ctx.answerCbQuery('Это блюдо недоступно!');
    }

    await Cart.addItem(ctx.from.id, menuItemId, 1);
    ctx.answerCbQuery(`${item.name} добавлено в корзину!`);
  });

  // === Admin: menu management ===
  bot.hears('Управление меню', (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('Нет доступа.');
    ctx.reply('Управление меню:', menuAdminKeyboard());
  });

  // Add dish
  bot.hears('Добавить блюдо', (ctx) => {
    if (!isAdmin(ctx)) return;
    bot.context = bot.context || {};
    bot.context[ctx.from.id] = { action: 'add_dish', step: 'name' };
    ctx.reply('Введите название блюда:');
  });

  // List all dishes
  bot.hears('Список блюд', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const items = await Menu.getAllActive();
    if (!items.length) return ctx.reply('Блюд пока нет.', menuAdminKeyboard());

    let text = '<b>Все блюда:</b>\n\n';
    items.forEach(item => {
      const daily = item.is_daily ? ' [ежедн.]' : '';
      text += `[${item.id}] <b>${item.name}</b> — ${formatPrice(item.price)}${daily}\n`;
    });
    text += '\nДля удаления: /delete_dish_ID';
    ctx.reply(text, { parse_mode: 'HTML' });
  });

  // Delete dish
  bot.hears(/^\/delete_dish_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const id = parseInt(ctx.match[1]);
    await Menu.deleteItem(id);
    ctx.reply('Блюдо удалено.', menuAdminKeyboard());
  });

  // Add to daily menu
  bot.hears('Добавить в меню дня', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const items = (await Menu.getAllActive()).filter(i => !i.is_daily);
    if (!items.length) return ctx.reply('Нет блюд для добавления.', menuAdminKeyboard());

    const buttons = items.map(item =>
      [Markup.button.callback(`${item.name} — ${formatPrice(item.price)}`, `daily_select_${item.id}`)]
    );
    ctx.reply('Выберите блюдо для меню дня:', Markup.inlineKeyboard(buttons));
  });

  bot.action(/^daily_select_(\d+)$/, (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.answerCbQuery();
    const menuItemId = parseInt(ctx.match[1]);

    const buttons = [];
    if (isTodayWorkday()) {
      buttons.push([Markup.button.callback(`Сегодня (${formatDate(getToday())})`, `daily_date_${menuItemId}_${getToday()}`)]);
    }
    const workdays = getNextWorkdays(3);
    workdays.forEach(date => {
      buttons.push([Markup.button.callback(formatDate(date), `daily_date_${menuItemId}_${date}`)]);
    });

    ctx.reply('Выберите дату:', Markup.inlineKeyboard(buttons));
  });

  bot.action(/^daily_date_(\d+)_(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.answerCbQuery();
    const menuItemId = parseInt(ctx.match[1]);
    const date = ctx.match[2];

    await Menu.addToDaily(menuItemId, date);
    const item = await Menu.getItem(menuItemId);
    ctx.reply(`"${item.name}" добавлено в меню на ${formatDate(date)}.`, menuAdminKeyboard());
  });

  // Today's daily menu (admin view)
  bot.hears('Меню на сегодня (админ)', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const items = await Menu.getDailyMenu(getToday());
    if (!items.length) return ctx.reply('Меню на сегодня пусто.', menuAdminKeyboard());

    let text = '<b>Меню на сегодня:</b>\n\n';
    items.forEach(item => {
      const daily = item.is_daily ? ' [ежедн.]' : '';
      const removeCmd = item.daily_menu_id ? ` — /remove_daily_${item.daily_menu_id}` : '';
      text += `<b>${item.name}</b> — ${formatPrice(item.price)}${daily}${removeCmd}\n`;
    });
    ctx.reply(text, { parse_mode: 'HTML' });
  });

  bot.hears(/^\/remove_daily_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    await Menu.removeFromDaily(parseInt(ctx.match[1]));
    ctx.reply('Блюдо убрано из дневного меню.', menuAdminKeyboard());
  });

  // === Daily items management ===
  bot.hears('Ежедневные блюда', async (ctx) => {
    if (!isAdmin(ctx)) return;
    const dailyItems = await Menu.getDailyItems();
    const allItems = await Menu.getAllActive();

    let text = '<b>Ежедневные блюда</b> (всегда в меню):\n\n';
    if (dailyItems.length) {
      dailyItems.forEach(item => {
        text += `<b>${item.name}</b> — ${formatPrice(item.price)}\n`;
      });
    } else {
      text += 'Пока нет ежедневных блюд.\n';
    }

    const nonDaily = allItems.filter(i => !i.is_daily);
    const buttons = [];

    if (nonDaily.length) {
      buttons.push(...nonDaily.map(item =>
        [Markup.button.callback(`+ ${item.name}`, `set_daily_${item.id}`)]
      ));
    }

    if (dailyItems.length) {
      buttons.push(...dailyItems.map(item =>
        [Markup.button.callback(`- ${item.name}`, `unset_daily_${item.id}`)]
      ));
    }

    ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  });

  bot.action(/^set_daily_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const id = parseInt(ctx.match[1]);
    await Menu.setDaily(id, true);
    const item = await Menu.getItem(id);
    ctx.answerCbQuery(`"${item.name}" теперь ежедневное блюдо`);
    ctx.reply(`"${item.name}" добавлено в ежедневные блюда.`, menuAdminKeyboard());
  });

  bot.action(/^unset_daily_(\d+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const id = parseInt(ctx.match[1]);
    await Menu.setDaily(id, false);
    const item = await Menu.getItem(id);
    ctx.answerCbQuery(`"${item.name}" убрано из ежедневных`);
    ctx.reply(`"${item.name}" убрано из ежедневных блюд.`, menuAdminKeyboard());
  });

  // Inline buttons for "is daily?" question
  bot.action(/^dish_daily_(yes|no)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.answerCbQuery();
    const pending = bot.context?.[ctx.from.id];
    if (!pending || pending.action !== 'add_dish' || pending.step !== 'waiting_daily_btn') return;

    const isDaily = ctx.match[1] === 'yes';
    const id = await Menu.addItem({
      name: pending.name,
      description: pending.description,
      price: pending.price,
      photo_id: pending.photo_id,
      calories: pending.calories || null,
      proteins: pending.proteins || null,
      fats: pending.fats || null,
      carbs: pending.carbs || null,
      is_daily: isDaily
    });

    const dailyText = isDaily ? ' (ежедневное)' : '';
    ctx.reply(
      `Блюдо "${pending.name}" добавлено (ID: ${id})!${dailyText}\nЦена: ${formatPrice(pending.price)}`,
      menuAdminKeyboard()
    );
    delete bot.context[ctx.from.id];
  });

  // === Message handler for multi-step flows ===
  bot.on('message', (ctx, next) => {
    if (!isAdmin(ctx)) return next();
    const pending = bot.context?.[ctx.from.id];
    if (!pending) return next();

    if (pending.action === 'add_dish') {
      return handleAddDishFlow(ctx, bot, pending);
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
      pending.step = 'waiting_daily_btn';
      ctx.reply('Это ежедневное блюдо?', Markup.inlineKeyboard([
        Markup.button.callback('Да', 'dish_daily_yes'),
        Markup.button.callback('Нет', 'dish_daily_no')
      ]));
      break;
  }
}

module.exports = { setupMenuHandler };
