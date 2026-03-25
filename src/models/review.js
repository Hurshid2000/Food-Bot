const { query, queryOne, execute } = require('./database');

const Review = {
  async add(userId, orderId, menuItemId, rating, comment) {
    return await execute(
      'INSERT INTO reviews (user_id, order_id, menu_item_id, rating, comment) VALUES ($1, $2, $3, $4, $5)',
      [userId, orderId, menuItemId, rating, comment]
    );
  },

  async getForItem(menuItemId) {
    return await query(
      `SELECT r.*, u.first_name, u.username
       FROM reviews r
       JOIN users u ON r.user_id = u.telegram_id
       WHERE r.menu_item_id = $1
       ORDER BY r.created_at DESC`,
      [menuItemId]
    );
  },

  async getAvgRating(menuItemId) {
    return await queryOne(
      `SELECT ROUND(AVG(rating)::numeric, 1) as avg_rating, COUNT(*) as count
       FROM reviews WHERE menu_item_id = $1`,
      [menuItemId]
    );
  },

  async hasReviewed(userId, orderId, menuItemId) {
    return await queryOne(
      'SELECT id FROM reviews WHERE user_id = $1 AND order_id = $2 AND menu_item_id = $3',
      [userId, orderId, menuItemId]
    );
  }
};

module.exports = Review;
