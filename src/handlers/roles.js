const { Markup } = require('telegraf');
const User = require('../models/user');
const { isSuperAdmin } = require('../middleware/auth');
const { mainKeyboard } = require('../keyboards/main');

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

  bot.action('role_list', (ctx) => {
    if (!isSuperAdmin(ctx)) return;
    const admins = User.getAllAdmins();
    const cooks = User.getAllCooks();

    let text = 'Админы:\n';
    admins.forEach(a => {
      text += `  - ${a.first_name || ''} ${a.last_name || ''} (@${a.username || 'нет'}) [${a.role}]\n`;
    });
    text += '\nПовара:\n';
    cooks.forEach(c => {
      text += `  - ${c.first_name || ''} ${c.last_name || ''} (@${c.username || 'нет'})\n`;
    });

    if (!admins.length && !cooks.length) text = 'Пока нет назначенных ролей.';
    ctx.answerCbQuery();
    ctx.reply(text);
  });

  for (const role of ['admin', 'cook', 'user']) {
    bot.action(`role_set_${role}`, (ctx) => {
      if (!isSuperAdmin(ctx)) return;
      ctx.answerCbQuery();
      ctx.reply(
        `Перешлите сообщение от пользователя, которому хотите ${role === 'user' ? 'снять роль' : `назначить роль "${role}"`}, или введите его Telegram ID:`,
        Markup.forceReply()
      );
      ctx.state.user._pendingRoleAction = role;
      bot.context = bot.context || {};
      bot.context[ctx.from.id] = { action: 'set_role', role };
    });
  }

  bot.on('message', (ctx, next) => {
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

    const targetUser = User.findByTelegramId(targetId);
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

    User.setRole(targetId, pending.role);
    const roleNames = { admin: 'Админ', cook: 'Повар', user: 'Пользователь' };
    ctx.reply(
      `Роль "${roleNames[pending.role]}" назначена пользователю ${targetUser.first_name || ''} (@${targetUser.username || 'нет'}).`,
      mainKeyboard(ctx.state.user.role)
    );
    delete bot.context[ctx.from.id];
  });
}

module.exports = { setupRolesHandler };
