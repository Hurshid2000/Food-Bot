const { Markup } = require('telegraf');
const { query, queryOne } = require('../models/database');
const { isAdmin } = require('../middleware/auth');
const { formatPrice } = require('../utils/helpers');
const { adminPanelKeyboard } = require('../keyboards/main');

function setupStatsHandler(bot) {
  bot.hears('Статистика', (ctx) => {
    if (!isAdmin(ctx)) return ctx.reply('Нет доступа.');

    ctx.reply('Статистика:', Markup.inlineKeyboard([
      [Markup.button.callback('За сегодня', 'stats_today')],
      [Markup.button.callback('За неделю', 'stats_week')],
      [Markup.button.callback('За месяц', 'stats_month')],
      [Markup.button.callback('За всё время', 'stats_all')],
      [Markup.button.callback('Топ блюд', 'stats_top_items')]
    ]));
  });

  bot.action(/^stats_(today|week|month|all)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.answerCbQuery();

    const period = ctx.match[1];
    let dateFilter = '';
    let params = [];
    let periodName = '';

    switch (period) {
      case 'today':
        dateFilter = `AND DATE(o.created_at) = CURRENT_DATE`;
        periodName = 'Сегодня';
        break;
      case 'week':
        dateFilter = `AND o.created_at >= NOW() - INTERVAL '7 days'`;
        periodName = 'За неделю';
        break;
      case 'month':
        dateFilter = `AND o.created_at >= NOW() - INTERVAL '30 days'`;
        periodName = 'За месяц';
        break;
      case 'all':
        dateFilter = '';
        periodName = 'За всё время';
        break;
    }

    const summary = await queryOne(`
      SELECT
        COUNT(*) as total_orders,
        COALESCE(SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END), 0) as delivered,
        COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) as cancelled,
        COALESCE(SUM(CASE WHEN status NOT IN ('delivered', 'cancelled') THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total ELSE 0 END), 0) as revenue
      FROM orders o
      WHERE 1=1 ${dateFilter}
    `);

    const topItems = await query(`
      SELECT mi.name, SUM(oi.quantity) as total_qty, SUM(oi.quantity * oi.price) as total_sum
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status != 'cancelled' ${dateFilter}
      GROUP BY mi.id, mi.name
      ORDER BY total_qty DESC
      LIMIT 10
    `);

    let text = `<b>Статистика — ${periodName}</b>\n\n`;
    text += `Всего заказов: ${summary.total_orders}\n`;
    text += `Доставлено: ${summary.delivered}\n`;
    text += `Отменено: ${summary.cancelled}\n`;
    text += `Активных: ${summary.active}\n`;
    text += `Выручка: ${formatPrice(summary.revenue)}\n`;

    if (topItems.length) {
      text += `\n<b>Продажи по блюдам:</b>\n`;
      topItems.forEach((item, i) => {
        text += `${i + 1}. ${item.name} — ${item.total_qty} шт. (${formatPrice(item.total_sum)})\n`;
      });
    }

    ctx.reply(text, { parse_mode: 'HTML' });
  });

  bot.action('stats_top_items', async (ctx) => {
    if (!isAdmin(ctx)) return;
    ctx.answerCbQuery();

    const items = await query(`
      SELECT mi.name, mi.price,
             COALESCE(SUM(oi.quantity), 0) as total_qty,
             COALESCE(SUM(oi.quantity * oi.price), 0) as total_sum,
             ROUND(AVG(r.rating)::numeric, 1) as avg_rating,
             COUNT(DISTINCT r.id) as review_count
      FROM menu_items mi
      LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
      LEFT JOIN orders o ON oi.order_id = o.id AND o.status != 'cancelled'
      LEFT JOIN reviews r ON mi.id = r.menu_item_id
      WHERE mi.is_active = TRUE
      GROUP BY mi.id, mi.name, mi.price
      ORDER BY total_qty DESC
    `);

    if (!items.length) return ctx.reply('Нет данных.');

    let text = '<b>Детальная статистика по блюдам:</b>\n\n';
    items.forEach((item, i) => {
      const rating = item.avg_rating ? ` | ${item.avg_rating}/5 (${item.review_count} отз.)` : '';
      text += `${i + 1}. <b>${item.name}</b>\n`;
      text += `   Цена: ${formatPrice(item.price)} | Продано: ${item.total_qty} шт.\n`;
      text += `   Сумма: ${formatPrice(item.total_sum)}${rating}\n\n`;
    });

    ctx.reply(text, { parse_mode: 'HTML' });
  });
}

module.exports = { setupStatsHandler };
