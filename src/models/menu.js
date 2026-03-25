const db = require('./database');

const Menu = {
  addItem({ name, description, price, photo_id, calories, proteins, fats, carbs }) {
    const result = db.prepare(`
      INSERT INTO menu_items (name, description, price, photo_id, calories, proteins, fats, carbs)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, description, price, photo_id, calories, proteins, fats, carbs);
    return result.lastInsertRowid;
  },

  updateItem(id, fields) {
    const keys = Object.keys(fields);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => fields[k]);
    return db.prepare(`UPDATE menu_items SET ${sets} WHERE id = ?`).run(...values, id);
  },

  deleteItem(id) {
    return db.prepare('UPDATE menu_items SET is_active = 0 WHERE id = ?').run(id);
  },

  getItem(id) {
    return db.prepare('SELECT * FROM menu_items WHERE id = ?').get(id);
  },

  getAllActive() {
    return db.prepare('SELECT * FROM menu_items WHERE is_active = 1 ORDER BY name').all();
  },

  // Daily menu
  addToDaily(menuItemId, date, availableQty) {
    return db.prepare(`
      INSERT OR REPLACE INTO daily_menu (menu_item_id, date, available_qty)
      VALUES (?, ?, ?)
    `).run(menuItemId, date, availableQty);
  },

  removeFromDaily(id) {
    return db.prepare('DELETE FROM daily_menu WHERE id = ?').run(id);
  },

  getDailyMenu(date) {
    return db.prepare(`
      SELECT dm.*, mi.name, mi.description, mi.price, mi.photo_id,
             mi.calories, mi.proteins, mi.fats, mi.carbs
      FROM daily_menu dm
      JOIN menu_items mi ON dm.menu_item_id = mi.id
      WHERE dm.date = ? AND mi.is_active = 1
    `).all(date);
  },

  getDailyMenuItem(dailyMenuId) {
    return db.prepare(`
      SELECT dm.*, mi.name, mi.description, mi.price, mi.photo_id,
             mi.calories, mi.proteins, mi.fats, mi.carbs
      FROM daily_menu dm
      JOIN menu_items mi ON dm.menu_item_id = mi.id
      WHERE dm.id = ?
    `).get(dailyMenuId);
  },

  decrementQty(dailyMenuId, qty) {
    return db.prepare(`
      UPDATE daily_menu SET available_qty = available_qty - ? WHERE id = ? AND available_qty >= ?
    `).run(qty, dailyMenuId, qty);
  },

  getPopularItems(limit = 10) {
    return db.prepare(`
      SELECT mi.*, COUNT(oi.id) as order_count, ROUND(AVG(r.rating), 1) as avg_rating
      FROM menu_items mi
      LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
      LEFT JOIN reviews r ON mi.id = r.menu_item_id
      WHERE mi.is_active = 1
      GROUP BY mi.id
      ORDER BY order_count DESC
      LIMIT ?
    `).all(limit);
  }
};

module.exports = Menu;
