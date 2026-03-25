const { Markup } = require('telegraf');
const Review = require('../models/review');
const Order = require('../models/order');
const { mainKeyboard } = require('../keyboards/main');

function setupReviewsHandler(bot) {
  bot.action(/^review_order_(\d+)$/, (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    const order = Order.getWithItems(orderId);

    if (!order || order.status !== 'delivered') {
      return ctx.reply('Отзыв можно оставить только на доставленный заказ.');
    }

    if (order.user_id !== ctx.from.id) return;

    const buttons = order.items.map(item =>
      [Markup.button.callback(item.name, `review_item_${orderId}_${item.menu_item_id}`)]
    );

    ctx.reply('Выберите блюдо для отзыва:', Markup.inlineKeyboard(buttons));
  });

  bot.action(/^review_item_(\d+)_(\d+)$/, (ctx) => {
    ctx.answerCbQuery();
    const orderId = parseInt(ctx.match[1]);
    const menuItemId = parseInt(ctx.match[2]);

    if (Review.hasReviewed(ctx.from.id, orderId, menuItemId)) {
      return ctx.reply('Вы уже оставили отзыв на это блюдо.');
    }

    bot.context = bot.context || {};
    bot.context[ctx.from.id] = {
      action: 'add_review',
      step: 'rating',
      orderId,
      menuItemId
    };

    ctx.reply('Оцените блюдо от 1 до 5:', Markup.inlineKeyboard([
      [1, 2, 3, 4, 5].map(n =>
        Markup.button.callback(`${'⭐'.repeat(n)}`, `rating_${n}_${orderId}_${menuItemId}`)
      )
    ]));
  });

  bot.action(/^rating_(\d)_(\d+)_(\d+)$/, (ctx) => {
    ctx.answerCbQuery();
    const rating = parseInt(ctx.match[1]);
    const orderId = parseInt(ctx.match[2]);
    const menuItemId = parseInt(ctx.match[3]);

    bot.context = bot.context || {};
    bot.context[ctx.from.id] = {
      action: 'add_review',
      step: 'comment',
      orderId,
      menuItemId,
      rating
    };

    ctx.reply('Напишите комментарий (или "-" чтобы пропустить):');
  });

  bot.on('message', (ctx, next) => {
    const pending = bot.context?.[ctx.from.id];
    if (!pending || pending.action !== 'add_review' || pending.step !== 'comment') return next();

    const comment = ctx.message.text === '-' ? null : ctx.message.text;

    Review.add(ctx.from.id, pending.orderId, pending.menuItemId, pending.rating, comment);
    delete bot.context[ctx.from.id];

    ctx.reply('Спасибо за отзыв!', mainKeyboard(ctx.state.user.role));
  });
}

module.exports = { setupReviewsHandler };
