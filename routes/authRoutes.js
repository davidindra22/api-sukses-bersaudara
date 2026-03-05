import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { loginUser } from "../controllers/authController.js";
import { logoutUser } from "../controllers/authController.js";
// import { reimburse } from "../controllers/reimburse.js";

const router = express.Router();

router.post("/login", loginUser);
router.post("/logout", logoutUser);
// router.post("/reimburse", reimburse);

export default router;
