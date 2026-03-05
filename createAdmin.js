// createAdmin.js
import bcrypt from "bcrypt";
import pool from "./config/dbconnect.js";

async function createUser(username, plainPassword) {
  try {
    // cek apakah user sudah ada
    const [rows] = await pool.query(
      "SELECT id_users FROM users WHERE username = ?",
      [username]
    );
    if (rows.length > 0) {
      console.log(`User "${username}" sudah ada. Batal membuat.`);
      process.exit(0);
    }

    // hash password
    const saltRounds = 10;
    const hashed = await bcrypt.hash(plainPassword, saltRounds);

    // insert
    const [result] = await pool.query(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hashed]
    );

    console.log("User berhasil dibuat dengan id:", result.insertId);
    process.exit(0);
  } catch (err) {
    console.error("Gagal membuat user:", err.message || err);
    process.exit(1);
  }
}

// ambil argumen dari CLI
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("Usage: node createAdmin.js <username> <password> [role]");
  process.exit(1);
}

const [username, password] = args;
createUser(username, password);
