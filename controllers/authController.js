import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pool from "../config/dbconnect.js";

// Login user
export const loginUser = async (req, res) => {
  try {
    const { username, password } = req.body;

    const [results] = await pool.query(
      "SELECT * FROM users WHERE username = ?",
      [username],
    );

    if (results.length === 0) {
      return res.status(401).json({ message: "Username tidak ditemukan" });
    }

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(401).json({ message: "Password salah" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
    console.log("SIGN SECRET:", process.env.JWT_SECRET);

    return res.status(200).json({
      message: "Login berhasil",
      token,
      user: { id: user.id, username: user.username, role: user.role },
    });
  } catch (err) {
    console.error("Error login:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};

export const logoutUser = async (req, res) => {
  try {
    res.status(200).json({ message: "Logout berhasil" });
  } catch (err) {
    console.error("Error logout:", err);
    return res
      .status(500)
      .json({ message: "Server error", error: err.message });
  }
};
