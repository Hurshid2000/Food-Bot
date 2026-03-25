const { query, queryOne, execute } = require('./database');

const Cart = {
  async addItem(userId, menuItemId, quantity = 1) {
    return await execute(
      `INSERT INTO cart (user_id, menu_item_id, quantity) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, menu_item_id) DO UPDATE SET quantity = cart.quantity + $3`,
      [userId, menuItemId, quantity]
    );
  },

  async updateQty(userId, menuItemId, quantity) {
    if (quantity <= 0) {
      return await execute('DELETE FROM cart WHERE user_id = $1 AND menu_item_id = $2', [userId, menuItemId]);
    }
    return await execute('UPDATE cart SET quantity = $1 WHERE user_id = $2 AND menu_item_id = $3', [quantity, userId, menuItemId]);
  },

  async getCart(userId) {
    return await query(
      `SELECT c.*, mi.name, mi.price, mi.photo_id,
              mi.calories, mi.proteins, mi.fats, mi.carbs
       FROM cart c
       JOIN menu_items mi ON c.menu_item_id = mi.id
       WHERE c.user_id = $1`,
      [userId]
    );
  },

  async clear(userId) {
    return await execute('DELETE FROM cart WHERE user_id = $1', [userId]);
  },

  async getTotal(userId) {
    const result = await queryOne(
      `SELECT COALESCE(SUM(c.quantity * mi.price), 0) as total
       FROM cart c
       JOIN menu_items mi ON c.menu_item_id = mi.id
       WHERE c.user_id = $1`,
      [userId]
    );
    return result;
  }
};

module.exports = Cart;
