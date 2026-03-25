const { query, queryOne, execute } = require('./database');

const Order = {
  async create(userId, locationId, note) {
    const result = await queryOne(
      'INSERT INTO orders (user_id, location_id, note) VALUES ($1, $2, $3) RETURNING id',
      [userId, locationId, note]
    );
    return result.id;
  },

  async addItem(orderId, menuItemId, quantity, price) {
    await execute(
      'INSERT INTO order_items (order_id, menu_item_id, quantity, price) VALUES ($1, $2, $3, $4)',
      [orderId, menuItemId, quantity, price]
    );
  },

  async updateTotal(orderId) {
    await execute(
      `UPDATE orders SET total = (
        SELECT COALESCE(SUM(quantity * price), 0) FROM order_items WHERE order_id = $1
      ) WHERE id = $1`,
      [orderId]
    );
  },

  async setStatus(orderId, status) {
    return await execute('UPDATE orders SET status = $1 WHERE id = $2', [status, orderId]);
  },

  async getById(orderId) {
    return await queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
  },

  async getWithItems(orderId) {
    const order = await queryOne(
      `SELECT o.*, l.name as location_name, l.address as location_address,
              u.first_name, u.last_name, u.username, u.phone
       FROM orders o
       LEFT JOIN locations l ON o.location_id = l.id
       LEFT JOIN users u ON o.user_id = u.telegram_id
       WHERE o.id = $1`,
      [orderId]
    );

    if (!order) return null;

    order.items = await query(
      `SELECT oi.*, mi.name, mi.description
       FROM order_items oi
       JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE oi.order_id = $1`,
      [orderId]
    );

    return order;
  },

  async getUserOrders(userId, limit = 20) {
    return await query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
  },

  async getActiveOrders() {
    return await query(
      `SELECT o.*, u.first_name, u.last_name, u.username, u.phone,
              l.name as location_name, l.address as location_address
       FROM orders o
       JOIN users u ON o.user_id = u.telegram_id
       LEFT JOIN locations l ON o.location_id = l.id
       WHERE o.status NOT IN ('delivered', 'cancelled')
       ORDER BY o.created_at DESC`
    );
  },

  async clearItems(orderId) {
    return await execute('DELETE FROM order_items WHERE order_id = $1', [orderId]);
  },

  async updateLocation(orderId, locationId) {
    return await execute('UPDATE orders SET location_id = $1 WHERE id = $2', [locationId, orderId]);
  },

  async getTodayOrders() {
    return await query(
      `SELECT o.*, u.first_name, u.last_name, u.username
       FROM orders o
       JOIN users u ON o.user_id = u.telegram_id
       WHERE DATE(o.created_at) = CURRENT_DATE
       ORDER BY o.created_at DESC`
    );
  },

  async autoCompleteOldOrders() {
    const result = await execute(
      `UPDATE orders SET status = 'delivered'
       WHERE DATE(created_at) < CURRENT_DATE
         AND status NOT IN ('delivered', 'cancelled')`
    );
    return { changes: result.rowCount };
  },

  async getAllOrders(limit = 50, offset = 0) {
    return await query(
      `SELECT o.*, u.first_name, u.last_name, u.username,
              l.name as location_name, l.address as location_address
       FROM orders o
       JOIN users u ON o.user_id = u.telegram_id
       LEFT JOIN locations l ON o.location_id = l.id
       ORDER BY o.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
  },

  async getUserHistory(userId, limit = 20) {
    return await query(
      `SELECT * FROM orders
       WHERE user_id = $1 AND status IN ('delivered', 'cancelled')
       ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
  }
};

module.exports = Order;
