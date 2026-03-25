const { query, queryOne, execute } = require('./database');

const User = {
  async findOrCreate(telegramUser) {
    const existing = await queryOne('SELECT * FROM users WHERE telegram_id = $1', [telegramUser.id]);
    if (existing) return existing;

    await execute(
      'INSERT INTO users (telegram_id, username, first_name, last_name) VALUES ($1, $2, $3, $4)',
      [telegramUser.id, telegramUser.username, telegramUser.first_name, telegramUser.last_name]
    );

    return await queryOne('SELECT * FROM users WHERE telegram_id = $1', [telegramUser.id]);
  },

  async findByTelegramId(telegramId) {
    return await queryOne('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
  },

  async setRole(telegramId, role) {
    return await execute('UPDATE users SET role = $1 WHERE telegram_id = $2', [role, telegramId]);
  },

  async setPhone(telegramId, phone) {
    return await execute('UPDATE users SET phone = $1 WHERE telegram_id = $2', [phone, telegramId]);
  },

  async getAllAdmins() {
    return await query("SELECT * FROM users WHERE role IN ('admin', 'super_admin')");
  },

  async getAllCooks() {
    return await query("SELECT * FROM users WHERE role = 'cook'");
  },

  async getAll() {
    return await query('SELECT * FROM users ORDER BY created_at DESC');
  }
};

module.exports = User;
