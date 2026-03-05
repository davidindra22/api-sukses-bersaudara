import bcrypt from "bcrypt";
import pool from "./config/dbconnect.js";

const createEmployee = async () => {
  const username = "employe1";
  const password = "employe";
  const role = "employee";

  const hashedPassword = await bcrypt.hash(password, 10);

  await pool.query(
    "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
    [username, hashedPassword, role]
  );

  console.log("Employee berhasil dibuat");
};

createEmployee();
