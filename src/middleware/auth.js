const User = require('../models/user');

function authMiddleware() {
  return async (ctx, next) => {
    if (!ctx.from) return;
    const user = await User.findOrCreate(ctx.from);
    ctx.state.user = user;

    // Auto-assign super_admin
    if (String(ctx.from.id) === String(process.env.SUPER_ADMIN_ID) && user.role !== 'super_admin') {
      await User.setRole(ctx.from.id, 'super_admin');
      ctx.state.user.role = 'super_admin';
    }

    return next();
  };
}

function requireRole(...roles) {
  return (ctx, next) => {
    if (!ctx.state.user || !roles.includes(ctx.state.user.role)) {
      return ctx.reply('У вас нет доступа к этой функции.');
    }
    return next();
  };
}

function isAdmin(ctx) {
  return ['admin', 'super_admin'].includes(ctx.state.user?.role);
}

function isSuperAdmin(ctx) {
  return ctx.state.user?.role === 'super_admin';
}

function isCook(ctx) {
  return ctx.state.user?.role === 'cook';
}

module.exports = { authMiddleware, requireRole, isAdmin, isSuperAdmin, isCook };
