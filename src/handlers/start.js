const { mainKeyboard } = require('../keyboards/main');

function setupStartHandler(bot) {
  bot.start((ctx) => {
    const user = ctx.state.user;
    ctx.reply(
      `Привет, ${user.first_name}! Добро пожаловать в бот заказа ПП еды.\n\nВыберите действие:`,
      mainKeyboard(user.role)
    );
  });

  bot.hears('Назад', (ctx) => {
    ctx.reply('Главное меню:', mainKeyboard(ctx.state.user.role));
  });
}

module.exports = { setupStartHandler };
