const { query, queryOne, execute } = require('./database');

const Location = {
  async add(userId, name, address, latitude, longitude) {
    const result = await queryOne(
      'INSERT INTO locations (user_id, name, address, latitude, longitude) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [userId, name, address, latitude || null, longitude || null]
    );
    return result.id;
  },

  async getUserLocations(userId) {
    return await query('SELECT * FROM locations WHERE user_id = $1', [userId]);
  },

  async getById(id) {
    return await queryOne('SELECT * FROM locations WHERE id = $1', [id]);
  },

  async setDefault(userId, locationId) {
    await execute('UPDATE locations SET is_default = FALSE WHERE user_id = $1', [userId]);
    await execute('UPDATE locations SET is_default = TRUE WHERE id = $1 AND user_id = $2', [locationId, userId]);
  },

  async getDefault(userId) {
    return await queryOne('SELECT * FROM locations WHERE user_id = $1 AND is_default = TRUE', [userId]);
  },

  async delete(id, userId) {
    return await execute('DELETE FROM locations WHERE id = $1 AND user_id = $2', [id, userId]);
  }
};

module.exports = Location;
