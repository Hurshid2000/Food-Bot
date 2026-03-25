const { Markup } = require('telegraf');
const Location = require('../models/location');
const { mainKeyboard } = require('../keyboards/main');

function setupLocationsHandler(bot) {
  bot.hears('Мои адреса', (ctx) => {
    const locations = Location.getUserLocations(ctx.from.id);

    if (!locations.length) {
      bot.context = bot.context || {};
      bot.context[ctx.from.id] = { action: 'add_location', step: 'name' };
      return ctx.reply('У вас нет сохранённых адресов. Введите название (например "Офис"):');
    }

    let text = '<b>Ваши адреса:</b>\n\n';
    locations.forEach(loc => {
      const def = loc.is_default ? ' [по умолчанию]' : '';
      text += `${loc.name} — ${loc.address}${def}\n`;
    });

    const buttons = locations.map(loc => [
      Markup.button.callback(`${loc.name}`, `loc_info_${loc.id}`)
    ]);
    buttons.push([Markup.button.callback('Добавить адрес', 'loc_add')]);

    ctx.reply(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  });

  bot.action(/^loc_info_(\d+)$/, (ctx) => {
    ctx.answerCbQuery();
    const locId = parseInt(ctx.match[1]);
    const loc = Location.getById(locId);
    if (!loc) return ctx.reply('Адрес не найден.');

    ctx.reply(`<b>${loc.name}</b>\n${loc.address}`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('По умолчанию', `loc_default_${loc.id}`)],
        [Markup.button.callback('Удалить', `loc_delete_${loc.id}`)]
      ])
    });
  });

  bot.action(/^loc_default_(\d+)$/, (ctx) => {
    const locId = parseInt(ctx.match[1]);
    Location.setDefault(ctx.from.id, locId);
    ctx.answerCbQuery('Адрес установлен по умолчанию');
  });

  bot.action(/^loc_delete_(\d+)$/, (ctx) => {
    const locId = parseInt(ctx.match[1]);
    Location.delete(locId, ctx.from.id);
    ctx.answerCbQuery('Адрес удалён');
    ctx.reply('Адрес удалён.', mainKeyboard(ctx.state.user.role));
  });

  bot.action('loc_add', (ctx) => {
    ctx.answerCbQuery();
    bot.context = bot.context || {};
    bot.context[ctx.from.id] = { action: 'add_location', step: 'name' };
    ctx.reply('Введите название места (например "Офис"):');
  });

  // Message handler for add location flow
  bot.on('message', (ctx, next) => {
    const pending = bot.context?.[ctx.from.id];
    if (!pending || pending.action !== 'add_location') return next();

    if (pending.step === 'name') {
      pending.locationName = ctx.message.text;
      pending.step = 'address';
      ctx.reply('Введите адрес:');
    } else if (pending.step === 'address') {
      Location.add(ctx.from.id, pending.locationName, ctx.message.text);
      delete bot.context[ctx.from.id];
      ctx.reply(`Адрес "${pending.locationName}" сохранён!`, mainKeyboard(ctx.state.user.role));
    }
  });
}

module.exports = { setupLocationsHandler };
