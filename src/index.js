require('dotenv').config();
const { Telegraf } = require('telegraf');
const { initDB } = require('./models/database');
const Order = require('./models/order');

const { authMiddleware } = require('./middleware/auth');
const { setupStartHandler } = require('./handlers/start');
const { setupRolesHandler } = require('./handlers/roles');
const { setupMenuHandler } = require('./handlers/menu');
const { setupCartHandler } = require('./handlers/cart');
const { setupOrdersHandler } = require('./handlers/orders');
const { setupLocationsHandler } = require('./handlers/locations');
const { setupReviewsHandler } = require('./handlers/reviews');
const { setupStatsHandler } = require('./handlers/stats');

async function main() {
  // Initialize PostgreSQL tables
  await initDB();

  const bot = new Telegraf(process.env.BOT_TOKEN);

  // Shared context for multi-step flows
  bot.context = {};

  // Auth middleware — registers users and checks roles
  bot.use(authMiddleware());

  // Register all handlers
  setupStartHandler(bot);
  setupRolesHandler(bot);
  setupMenuHandler(bot);
  setupCartHandler(bot);
  setupOrdersHandler(bot);
  setupLocationsHandler(bot);
  setupReviewsHandler(bot);
  setupStatsHandler(bot);

  // Error handler
  bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('Произошла ошибка. Попробуйте ещё раз.').catch(() => {});
  });

  // Auto-complete yesterday's orders on startup
  const result = await Order.autoCompleteOldOrders();
  if (result.changes > 0) {
    console.log(`Auto-completed ${result.changes} old order(s).`);
  }

  // Launch with retry (handles 409 conflict during redeploy)
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await bot.launch({ dropPendingUpdates: true });
      console.log('Bot started!');
      break;
    } catch (err) {
      if (err.response?.error_code === 409 && attempt < 5) {
        console.log(`Attempt ${attempt}: another instance still running, retrying in 3s...`);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        throw err;
      }
    }
  }

  // Graceful shutdown
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

main().catch(err => {
  console.error('Failed to start bot:', err);
  process.exit(1);
});
