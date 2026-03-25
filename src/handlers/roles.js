const { Markup } = require('telegraf');
const User = require('../models/user');
const { isSuperAdmin } = require('../middleware/auth');
const { mainKeyboard, adminPanelKeyboard } = require('../keyboards/main');

function setupRolesHandler(bot) {
  bot.hears('Управление ролями', (ctx) => {
    if (!isSuperAdmin(ctx)) return ctx.reply('Нет доступа.');

    ctx.reply('Управление ролями:', Markup.inlineKeyboard([
      [Markup.button.callback('Назначить админа', 'role_set_admin')],
      [Markup.button.callback('Назначить повара', 'role_set_cook')],
      [Markup.button.callback('Снять роль (сделать юзером)', 'role_set_user')],
      [Markup.button.callback('Список ролей', 'role_list')]
    ]));
  });

  bot.action('role_list', async (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    const admins = await User.getAllAdmins();
    const cooks = await User.getAllCooks();

    let text = '<b>Роли:</b>\n\n<b>Админы:</b>\n';
    admins.forEach(a => {
      text += `  - ${a.first_name || ''} ${a.last_name || ''} (@${a.username || 'нет'}) [${a.role}]\n`;
    });
    text += '\n<b>Повара:</b>\n';
    cooks.forEach(c => {
      text += `  - ${c.first_name || ''} ${c.last_name || ''} (@${c.username || 'нет'})\n`;
    });

    if (!admins.length && !cooks.length) text = 'Пока нет назначенных ролей (кроме вас).';
    ctx.answerCbQuery();
    ctx.reply(text, { parse_mode: 'HTML' });
  });

  for (const role of ['admin', 'cook', 'user']) {
    bot.action(`role_set_${role}`, (ctx) => {
      if (!isSuperAdmin(ctx)) return;
      ctx.answerCbQuery();
      ctx.reply(
        `Перешлите сообщение от пользователя, которому хотите ${role === 'user' ? 'снять роль' : `назначить роль "${role}"`}, или введите его Telegram ID:`,
        Markup.forceReply()
      );
      bot.context = bot.context || {};
      bot.context[ctx.from.id] = { action: 'set_role', role };
    });
  }

  bot.on('message', async (ctx, next) => {
    if (!isSuperAdmin(ctx)) return next();

    const pending = bot.context?.[ctx.from.id];
    if (!pending || pending.action !== 'set_role') return next();

    let targetId;
    if (ctx.message.forward_from) {
      targetId = ctx.message.forward_from.id;
    } else if (ctx.message.text && /^\d+$/.test(ctx.message.text.trim())) {
      targetId = parseInt(ctx.message.text.trim());
    } else {
      return next();
    }

    const targetUser = await User.findByTelegramId(targetId);
    if (!targetUser) {
      ctx.reply('Пользователь не найден. Он должен сначала запустить бота.');
      delete bot.context[ctx.from.id];
      return;
    }

    if (targetId === ctx.from.id) {
      ctx.reply('Нельзя изменить свою роль.');
      delete bot.context[ctx.from.id];
      return;
    }

    await User.setRole(targetId, pending.role);
    const roleNames = { admin: 'Админ', cook: 'Повар', user: 'Пользователь' };
    ctx.reply(
      `Роль "${roleNames[pending.role]}" назначена пользователю ${targetUser.first_name || ''} (@${targetUser.username || 'нет'}).`,
      adminPanelKeyboard(ctx.state.user.role)
    );
    delete bot.context[ctx.from.id];
  });
}

module.exports = { setupRolesHandler };
