const getHealth = (req, res) => {
  res.send("BookCourier server is running");
};

module.exports = {
  getHealth,
};
