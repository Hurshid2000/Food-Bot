const { Markup } = require('telegraf');

function mainKeyboard(role) {
  // Admin/Super Admin — only admin buttons
  if (['admin', 'super_admin'].includes(role)) {
    return Markup.keyboard([
      ['Управление меню', 'Активные заказы'],
      ['👤 Панель']
    ]).resize();
  }

  // Cook — only cook buttons
  if (role === 'cook') {
    return Markup.keyboard([
      ['Активные заказы']
    ]).resize();
  }

  // Regular user
  return Markup.keyboard([
    ['Меню на сегодня', 'Корзина'],
    ['Мои заказы', 'Мои адреса'],
    ['История']
  ]).resize();
}

function menuAdminKeyboard() {
  return Markup.keyboard([
    ['Добавить блюдо', 'Список блюд'],
    ['Добавить в меню дня', 'Меню на сегодня (админ)'],
    ['Ежедневные блюда'],
    ['Назад']
  ]).resize();
}

function adminPanelKeyboard(role) {
  const buttons = [
    ['Статистика'],
    ['История заказов']
  ];

  if (role === 'super_admin') {
    buttons.push(['Управление ролями']);
  }

  buttons.push(['Назад']);

  return Markup.keyboard(buttons).resize();
}

module.exports = { mainKeyboard, menuAdminKeyboard, adminPanelKeyboard };
