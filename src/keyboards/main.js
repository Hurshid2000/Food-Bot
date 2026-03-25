const { Markup } = require('telegraf');

function mainKeyboard(role) {
  const buttons = [
    ['Меню на сегодня', 'Корзина'],
    ['Мои заказы', 'Мои адреса'],
    ['Популярное']
  ];

  if (['admin', 'super_admin'].includes(role)) {
    buttons.push(['Управление меню', 'Активные заказы']);
  }

  if (role === 'super_admin') {
    buttons.push(['Управление ролями']);
  }

  if (role === 'cook') {
    buttons.push(['Активные заказы']);
  }

  return Markup.keyboard(buttons).resize();
}

module.exports = { mainKeyboard };
