const { getDB } = require("../config/database");

const createContactMessage = async (req, res) => {
  const db = await getDB();
  const contactsCollection = db.collection("contacts");
  const { name, email, subject, message } = req.body;

  const contactMessage = {
    name: name.trim(),
    email: email.trim().toLowerCase(),
    subject: subject.trim(),
    message: message.trim(),
    status: "new",
    createdAt: new Date(),
  };

  const result = await contactsCollection.insertOne(contactMessage);
  res.status(201).send(result);
};

const getContactMessages = async (req, res) => {
  const db = await getDB();
  const result = await db
    .collection("contacts")
    .find()
    .sort({ createdAt: -1 })
    .toArray();

  res.send(result);
};

module.exports = {
  createContactMessage,
  getContactMessages,
};
