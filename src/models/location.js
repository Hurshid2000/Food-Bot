const db = require('./database');

const Location = {
  add(userId, name, address) {
    const result = db.prepare(`
      INSERT INTO locations (user_id, name, address) VALUES (?, ?, ?)
    `).run(userId, name, address);
    return result.lastInsertRowid;
  },

  getUserLocations(userId) {
    return db.prepare('SELECT * FROM locations WHERE user_id = ?').all(userId);
  },

  getById(id) {
    return db.prepare('SELECT * FROM locations WHERE id = ?').get(id);
  },

  setDefault(userId, locationId) {
    db.prepare('UPDATE locations SET is_default = 0 WHERE user_id = ?').run(userId);
    db.prepare('UPDATE locations SET is_default = 1 WHERE id = ? AND user_id = ?').run(locationId, userId);
  },

  getDefault(userId) {
    return db.prepare('SELECT * FROM locations WHERE user_id = ? AND is_default = 1').get(userId);
  },

  delete(id, userId) {
    return db.prepare('DELETE FROM locations WHERE id = ? AND user_id = ?').run(id, userId);
  }
};

module.exports = Location;
