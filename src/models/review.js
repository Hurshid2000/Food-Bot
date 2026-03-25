const db = require('./database');

const Review = {
  add(userId, orderId, menuItemId, rating, comment) {
    return db.prepare(`
      INSERT INTO reviews (user_id, order_id, menu_item_id, rating, comment)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, orderId, menuItemId, rating, comment);
  },

  getForItem(menuItemId) {
    return db.prepare(`
      SELECT r.*, u.first_name, u.username
      FROM reviews r
      JOIN users u ON r.user_id = u.telegram_id
      WHERE r.menu_item_id = ?
      ORDER BY r.created_at DESC
    `).all(menuItemId);
  },

  getAvgRating(menuItemId) {
    return db.prepare(`
      SELECT ROUND(AVG(rating), 1) as avg_rating, COUNT(*) as count
      FROM reviews WHERE menu_item_id = ?
    `).get(menuItemId);
  },

  hasReviewed(userId, orderId, menuItemId) {
    return db.prepare(`
      SELECT id FROM reviews WHERE user_id = ? AND order_id = ? AND menu_item_id = ?
    `).get(userId, orderId, menuItemId);
  }
};

module.exports = Review;
