const express = require("express");
const {
  createContactMessage,
  getContactMessages,
} = require("../controllers/contact.controller");
const { asyncHandler } = require("../middleware/error.middleware");
const { validateContactMessage } = require("../middleware/validate.middleware");
const { verifyAdmin, verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/", validateContactMessage, asyncHandler(createContactMessage));
router.get("/", verifyToken, verifyAdmin, asyncHandler(getContactMessages));

module.exports = router;
