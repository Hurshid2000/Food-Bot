const db = require('./database');

const User = {
  findOrCreate(telegramUser) {
    const existing = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramUser.id);
    if (existing) return existing;

    db.prepare(`
      INSERT INTO users (telegram_id, username, first_name, last_name)
      VALUES (?, ?, ?, ?)
    `).run(telegramUser.id, telegramUser.username, telegramUser.first_name, telegramUser.last_name);

    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramUser.id);
  },

  findByTelegramId(telegramId) {
    return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);
  },

  setRole(telegramId, role) {
    return db.prepare('UPDATE users SET role = ? WHERE telegram_id = ?').run(role, telegramId);
  },

  setPhone(telegramId, phone) {
    return db.prepare('UPDATE users SET phone = ? WHERE telegram_id = ?').run(phone, telegramId);
  },

  getAllAdmins() {
    return db.prepare("SELECT * FROM users WHERE role IN ('admin', 'super_admin')").all();
  },

  getAllCooks() {
    return db.prepare("SELECT * FROM users WHERE role = 'cook'").all();
  },

  getAll() {
    return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all();
  }
};

module.exports = User;
