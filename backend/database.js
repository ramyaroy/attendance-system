const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || '',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || ''
};

const defaultUser = {
  name: '',
  email: '',
  password: ''
};

const db = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 10
});

async function ensureDatabase() {
  const connection = await mysql.createConnection({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
  await connection.end();
}

async function initializeAuthTables() {
  await ensureDatabase();

  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) DEFAULT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS refresh_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      revoked_at DATETIME DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_refresh_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
  `);

  const [existingUsers] = await db.execute(
    'SELECT id FROM users WHERE email = ? LIMIT 1',
    [defaultUser.email]
  );

  if (!existingUsers.length) {
    const passwordHash = await bcrypt.hash(defaultUser.password, 12);
    await db.execute(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
      [defaultUser.name, defaultUser.email, passwordHash]
    );
  }
}

module.exports = {
  db,
  dbConfig,
  defaultUser,
  initializeAuthTables
};
