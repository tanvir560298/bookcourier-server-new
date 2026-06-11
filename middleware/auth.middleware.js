const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../config/auth");
const { getDB } = require("../config/database");
const { admin, isFirebaseAdminReady } = require("../config/firebase");

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.decoded = decoded;
    return next();
  } catch (jwtError) {
    if (jwtError.name === "TokenExpiredError") {
      return res.status(401).send({ message: "token expired" });
    }
  }

  if (!isFirebaseAdminReady()) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    return next();
  } catch {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

const verifyAdmin = async (req, res, next) => {
  try {
    const db = await getDB();
    const user = await db.collection("users").findOne({ email: req.decoded.email });

    if (user?.role !== "admin") {
      return res.status(403).send({ message: "admin access required" });
    }

    req.currentUser = user;
    return next();
  } catch (error) {
    return next(error);
  }
};

const verifyRole = (allowedRoles) => async (req, res, next) => {
  try {
    const db = await getDB();
    const user = await db.collection("users").findOne({ email: req.decoded.email });

    if (!user || !allowedRoles.includes(user.role || "user")) {
      return res.status(403).send({ message: "forbidden access" });
    }

    req.currentUser = user;
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  verifyAdmin,
  verifyRole,
  verifyToken,
};
