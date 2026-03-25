const db = require('./database');

const Order = {
  create(userId, locationId, note) {
    const result = db.prepare(`
      INSERT INTO orders (user_id, location_id, note) VALUES (?, ?, ?)
    `).run(userId, locationId, note);
    return result.lastInsertRowid;
  },

  addItem(orderId, menuItemId, quantity, price) {
    db.prepare(`
      INSERT INTO order_items (order_id, menu_item_id, quantity, price)
      VALUES (?, ?, ?, ?)
    `).run(orderId, menuItemId, quantity, price);
  },

  updateTotal(orderId) {
    db.prepare(`
      UPDATE orders SET total = (
        SELECT COALESCE(SUM(quantity * price), 0) FROM order_items WHERE order_id = ?
      ) WHERE id = ?
    `).run(orderId, orderId);
  },

  setStatus(orderId, status) {
    return db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, orderId);
  },

  getById(orderId) {
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  },

  getWithItems(orderId) {
    const order = db.prepare(`
      SELECT o.*, l.name as location_name, l.address as location_address,
             u.first_name, u.last_name, u.username, u.phone
      FROM orders o
      LEFT JOIN locations l ON o.location_id = l.id
      LEFT JOIN users u ON o.user_id = u.telegram_id
      WHERE o.id = ?
    `).get(orderId);

    if (!order) return null;

    order.items = db.prepare(`
      SELECT oi.*, mi.name, mi.description
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE oi.order_id = ?
    `).all(orderId);

    return order;
  },

  getUserOrders(userId, limit = 20) {
    return db.prepare(`
      SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(userId, limit);
  },

  getActiveOrders() {
    return db.prepare(`
      SELECT o.*, u.first_name, u.last_name, u.username, u.phone,
             l.name as location_name, l.address as location_address
      FROM orders o
      JOIN users u ON o.user_id = u.telegram_id
      LEFT JOIN locations l ON o.location_id = l.id
      WHERE o.status NOT IN ('delivered', 'cancelled')
      ORDER BY o.created_at DESC
    `).all();
  },

  getTodayOrders() {
    return db.prepare(`
      SELECT o.*, u.first_name, u.last_name, u.username
      FROM orders o
      JOIN users u ON o.user_id = u.telegram_id
      WHERE DATE(o.created_at) = DATE('now')
      ORDER BY o.created_at DESC
    `).all();
  }
};

module.exports = Order;
