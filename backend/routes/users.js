import express from "express";
import {
  // getUsers,
  // getUserById,
  // updateUser,
  // deleteUser,
  profile,
  edit_profile,
} from "../controllers/userController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/profile", authenticate, profile);
router.post("/profile", authenticate, edit_profile);
// router.get("/", authenticate, getUsers);
// router.get("/:id", authenticate, getUserById);
// router.put("/:id", authenticate, updateUser);
// router.delete("/:id", authenticate, deleteUser);

export default router;
