const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'openmic',
  waitForConnections: true,
  connectionLimit: 10,
});


(async () => {
  try {
    const [db] = await pool.query("SELECT DATABASE() AS db");
    console.log("Current database:", db);

    const [tables] = await pool.query("SHOW TABLES");
    console.log("Tables:", tables);
  } catch (err) {
    console.error("Database test failed:", err);
  }
})();


module.exports = pool;