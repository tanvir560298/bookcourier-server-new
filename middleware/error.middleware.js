const notFound = (req, res, next) => {
  const error = new Error(`Route not found: ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

const errorHandler = (error, req, res, next) => {
  const statusCode = error.statusCode || error.status || 500;

  res.status(statusCode).send({
    message: error.message || "Internal server error",
    ...(process.env.NODE_ENV !== "production" ? { error: error.stack } : {}),
  });
};

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

module.exports = {
  asyncHandler,
  errorHandler,
  notFound,
};
