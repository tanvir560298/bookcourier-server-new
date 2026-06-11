const validateContactMessage = (req, res, next) => {
  const { name, email, subject, message } = req.body;

  if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
    return res.status(400).send({ message: "All contact fields are required" });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).send({ message: "A valid email is required" });
  }

  if (message.trim().length < 10) {
    return res.status(400).send({ message: "Message must be at least 10 characters" });
  }

  return next();
};

module.exports = {
  validateContactMessage,
};
