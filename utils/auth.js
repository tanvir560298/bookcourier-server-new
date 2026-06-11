const jwt = require("jsonwebtoken");
const { jwtExpiresIn, jwtSecret } = require("../config/auth");

const createToken = (user) => {
  return jwt.sign(
    {
      email: user.email,
      role: user.role || "user",
      name: user.name || "",
    },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );
};

const getPublicUser = (user) => ({
  _id: user._id,
  name: user.name || "",
  email: user.email,
  photo: user.photo || "",
  role: user.role || "user",
  authProvider: user.authProvider || "password",
  createdAt: user.createdAt,
});

const isStrongPassword = (password) => {
  return (
    typeof password === "string" &&
    password.length >= 6 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password)
  );
};

module.exports = {
  createToken,
  getPublicUser,
  isStrongPassword,
};
