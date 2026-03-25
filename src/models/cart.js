const db = require('./database');

const Cart = {
  addItem(userId, dailyMenuId, quantity = 1) {
    return db.prepare(`
      INSERT INTO cart (user_id, daily_menu_id, quantity) VALUES (?, ?, ?)
      ON CONFLICT(user_id, daily_menu_id) DO UPDATE SET quantity = quantity + ?
    `).run(userId, dailyMenuId, quantity, quantity);
  },

  updateQty(userId, dailyMenuId, quantity) {
    if (quantity <= 0) {
      return db.prepare('DELETE FROM cart WHERE user_id = ? AND daily_menu_id = ?').run(userId, dailyMenuId);
    }
    return db.prepare('UPDATE cart SET quantity = ? WHERE user_id = ? AND daily_menu_id = ?').run(quantity, userId, dailyMenuId);
  },

  getCart(userId) {
    return db.prepare(`
      SELECT c.*, dm.date, dm.available_qty, mi.name, mi.price, mi.photo_id,
             mi.calories, mi.proteins, mi.fats, mi.carbs
      FROM cart c
      JOIN daily_menu dm ON c.daily_menu_id = dm.id
      JOIN menu_items mi ON dm.menu_item_id = mi.id
      WHERE c.user_id = ?
    `).all(userId);
  },

  clear(userId) {
    return db.prepare('DELETE FROM cart WHERE user_id = ?').run(userId);
  },

  getTotal(userId) {
    return db.prepare(`
      SELECT COALESCE(SUM(c.quantity * mi.price), 0) as total
      FROM cart c
      JOIN daily_menu dm ON c.daily_menu_id = dm.id
      JOIN menu_items mi ON dm.menu_item_id = mi.id
      WHERE c.user_id = ?
    `).get(userId);
  }
};

module.exports = Cart;
