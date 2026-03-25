const { query, queryOne, execute } = require('./database');

const Menu = {
  async addItem({ name, description, price, photo_id, calories, proteins, fats, carbs, is_daily }) {
    const result = await queryOne(
      `INSERT INTO menu_items (name, description, price, photo_id, calories, proteins, fats, carbs, is_daily)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      [name, description, price, photo_id, calories, proteins, fats, carbs, is_daily || false]
    );
    return result.id;
  },

  async updateItem(id, fields) {
    const keys = Object.keys(fields);
    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = keys.map(k => fields[k]);
    return await execute(`UPDATE menu_items SET ${sets} WHERE id = $${keys.length + 1}`, [...values, id]);
  },

  async deleteItem(id) {
    return await execute('UPDATE menu_items SET is_active = FALSE WHERE id = $1', [id]);
  },

  async getItem(id) {
    return await queryOne('SELECT * FROM menu_items WHERE id = $1', [id]);
  },

  async getAllActive() {
    return await query('SELECT * FROM menu_items WHERE is_active = TRUE ORDER BY name');
  },

  async getDailyItems() {
    return await query('SELECT * FROM menu_items WHERE is_active = TRUE AND is_daily = TRUE ORDER BY name');
  },

  async setDaily(id, isDaily) {
    return await execute('UPDATE menu_items SET is_daily = $1 WHERE id = $2', [isDaily, id]);
  },

  async addToDaily(menuItemId, date) {
    return await execute(
      `INSERT INTO daily_menu (menu_item_id, date) VALUES ($1, $2)
       ON CONFLICT (menu_item_id, date) DO NOTHING`,
      [menuItemId, date]
    );
  },

  async removeFromDaily(id) {
    return await execute('DELETE FROM daily_menu WHERE id = $1', [id]);
  },

  async getDailyMenu(date) {
    return await query(
      `SELECT dm.id as daily_menu_id, mi.*
       FROM daily_menu dm
       JOIN menu_items mi ON dm.menu_item_id = mi.id
       WHERE dm.date = $1 AND mi.is_active = TRUE
       UNION
       SELECT 0 as daily_menu_id, mi.*
       FROM menu_items mi
       WHERE mi.is_daily = TRUE AND mi.is_active = TRUE`,
      [date]
    );
  },

  async getDailyMenuItem(dailyMenuId) {
    return await queryOne(
      `SELECT dm.id as daily_menu_id, mi.*
       FROM daily_menu dm
       JOIN menu_items mi ON dm.menu_item_id = mi.id
       WHERE dm.id = $1`,
      [dailyMenuId]
    );
  },

  async getPopularItems(limit = 10) {
    return await query(
      `SELECT mi.*, COUNT(oi.id) as order_count, ROUND(AVG(r.rating)::numeric, 1) as avg_rating
       FROM menu_items mi
       LEFT JOIN order_items oi ON mi.id = oi.menu_item_id
       LEFT JOIN reviews r ON mi.id = r.menu_item_id
       WHERE mi.is_active = TRUE
       GROUP BY mi.id
       ORDER BY order_count DESC
       LIMIT $1`,
      [limit]
    );
  }
};

module.exports = Menu;
