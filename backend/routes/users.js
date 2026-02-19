import express from "express";
import {
  profile,
  edit_profile,
  dashboard_summary,
} from "../controllers/userController.js";
import { authenticate } from "../middleware/auth.js";
import { validate } from "../middleware/validation.js";
import { editProfileSchema } from "../schemas/user.js";

const router = express.Router();

router.get("/profile", authenticate, profile);
router.get("/dashboard-summary", authenticate, dashboard_summary);
router.post("/profile", authenticate, validate(editProfileSchema), edit_profile);

export default router;
