const jwtSecret = process.env.JWT_SECRET || "bookcourier-local-development-secret";
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "7d";

module.exports = {
  jwtExpiresIn,
  jwtSecret,
};
