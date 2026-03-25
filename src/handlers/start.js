const { mainKeyboard, adminPanelKeyboard } = require('../keyboards/main');
const { isAdmin } = require('../middleware/auth');
const Order = require('../models/order');

function setupStartHandler(bot) {
  bot.start(async (ctx) => {
    await Order.autoCompleteOldOrders();
    const user = ctx.state.user;
    ctx.reply(
      `Привет, ${user.first_name}! Добро пожаловать в бот заказа ПП еды.\n\nВыберите действие:`,
      mainKeyboard(user.role)
    );
  });

  bot.hears('👤 Панель', (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.reply('Панель управления:', adminPanelKeyboard(ctx.state.user.role));
  });

  bot.hears('Назад', (ctx) => {
    ctx.reply('Главное меню:', mainKeyboard(ctx.state.user.role));
  });
}

module.exports = { setupStartHandler };
