const { Markup } = require('telegraf');
const Location = require('../models/location');
const { mainKeyboard } = require('../keyboards/main');

function setupLocationsHandler(bot) {
  bot.hears('Мои адреса', async (ctx) => {
    await showLocations(ctx);
  });

  bot.action('show_locations', async (ctx) => {
    ctx.answerCbQuery();
    await showLocations(ctx);
  });

  bot.action(/^loc_info_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const locId = parseInt(ctx.match[1]);
    const loc = await Location.getById(locId);
    if (!loc) return ctx.reply('Адрес не найден.');

    let text = `<b>${loc.name}</b>\n${loc.address}`;
    if (loc.is_default) text += '\n[по умолчанию]';

    const buttons = [
      [Markup.button.callback('По умолчанию', `loc_default_${loc.id}`)],
      [Markup.button.callback('Удалить', `loc_confirm_delete_${loc.id}`)]
    ];

    if (loc.latitude && loc.longitude) {
      buttons.unshift([Markup.button.callback('Показать на карте', `loc_map_${loc.id}`)]);
    }

    ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  });

  bot.action(/^loc_map_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const loc = await Location.getById(parseInt(ctx.match[1]));
    if (loc && loc.latitude && loc.longitude) {
      ctx.replyWithLocation(loc.latitude, loc.longitude);
    }
  });

  bot.action(/^loc_default_(\d+)$/, async (ctx) => {
    const locId = parseInt(ctx.match[1]);
    await Location.setDefault(ctx.from.id, locId);
    ctx.answerCbQuery('Адрес установлен по умолчанию');
  });

  bot.action(/^loc_confirm_delete_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery();
    const locId = parseInt(ctx.match[1]);
    const loc = await Location.getById(locId);
    if (!loc) return;

    ctx.reply(`Удалить адрес "${loc.name}"?`, Markup.inlineKeyboard([
      Markup.button.callback('Да, удалить', `loc_delete_${locId}`),
      Markup.button.callback('Отмена', `show_locations`)
    ]));
  });

  bot.action(/^loc_delete_(\d+)$/, async (ctx) => {
    const locId = parseInt(ctx.match[1]);
    await Location.delete(locId, ctx.from.id);
    ctx.answerCbQuery('Адрес удалён');
    await showLocations(ctx);
  });

  bot.action('loc_add', (ctx) => {
    ctx.answerCbQuery();
    bot.context = bot.context || {};
    bot.context[ctx.from.id] = { action: 'add_location', step: 'name' };
    ctx.reply('Введите название места (например "Офис"):');
  });

  bot.action('loc_add_map', (ctx) => {
    ctx.answerCbQuery();
    bot.context = bot.context || {};
    bot.context[ctx.from.id] = { action: 'add_location_map', step: 'name' };
    ctx.reply('Введите название места (например "Офис"):');
  });

  // Message handler for location flows
  bot.on('message', async (ctx, next) => {
    const pending = bot.context?.[ctx.from.id];
    if (!pending) return next();

    if (pending.action === 'add_location') {
      if (pending.step === 'name') {
        pending.locationName = ctx.message.text;
        pending.step = 'address';
        ctx.reply('Введите адрес:');
      } else if (pending.step === 'address') {
        await Location.add(ctx.from.id, pending.locationName, ctx.message.text);
        delete bot.context[ctx.from.id];
        ctx.reply(`Адрес "${pending.locationName}" сохранён!`, mainKeyboard(ctx.state.user.role));
      }
      return;
    }

    if (pending.action === 'add_location_map') {
      if (pending.step === 'name') {
        pending.locationName = ctx.message.text;
        pending.step = 'location';
        ctx.reply('Отправьте геолокацию (нажмите скрепку → Геопозиция):', Markup.keyboard([
          [Markup.button.locationRequest('Отправить моё местоположение')],
          ['Отмена']
        ]).resize().oneTime());
      } else if (pending.step === 'location') {
        if (ctx.message.text === 'Отмена') {
          delete bot.context[ctx.from.id];
          return ctx.reply('Отменено.', mainKeyboard(ctx.state.user.role));
        }
        if (!ctx.message.location) {
          return ctx.reply('Отправьте геолокацию или нажмите "Отмена":');
        }
        const { latitude, longitude } = ctx.message.location;
        const address = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        await Location.add(ctx.from.id, pending.locationName, address, latitude, longitude);
        delete bot.context[ctx.from.id];
        ctx.reply(`Адрес "${pending.locationName}" сохранён по геолокации!`, mainKeyboard(ctx.state.user.role));
      }
      return;
    }

    return next();
  });
}

async function showLocations(ctx) {
  const locations = await Location.getUserLocations(ctx.from.id);

  if (!locations.length) {
    return ctx.reply('У вас нет сохранённых адресов.', Markup.inlineKeyboard([
      [Markup.button.callback('Ввести адрес', 'loc_add')],
      [Markup.button.callback('Отправить геолокацию', 'loc_add_map')]
    ]));
  }

  let text = '<b>Ваши адреса:</b>\n\n';
  locations.forEach(loc => {
    const def = loc.is_default ? ' [по умолчанию]' : '';
    const pin = loc.latitude ? ' 📍' : '';
    text += `${loc.name} — ${loc.address}${def}${pin}\n`;
  });

  const buttons = locations.map(loc => [
    Markup.button.callback(`${loc.name}`, `loc_info_${loc.id}`)
  ]);
  buttons.push([
    Markup.button.callback('Ввести адрес', 'loc_add'),
    Markup.button.callback('По геолокации', 'loc_add_map')
  ]);

  ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
}

module.exports = { setupLocationsHandler };
