require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");

const app = express();
const port = process.env.PORT || 5001;
let firebaseAdminReady = false;

app.use(cors());
app.use(express.json());

if (!admin.apps.length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : require("./firebase-admin-key.json");

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseAdminReady = true;
  } catch (error) {
    console.warn(
      "Firebase Admin is not configured. Protected routes will be unavailable."
    );
  }
} else {
  firebaseAdminReady = true;
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mfz0bkx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let database;

async function getDB() {
  if (!database) {
    await client.connect();
    database = client.db("bookCourierDB");
    
  }
  return database;
}

const verifyToken = async (req, res, next) => {
  if (!firebaseAdminReady) {
    if (process.env.NODE_ENV !== "production") {
      req.decoded = {
        email: req.query.email || req.body?.userEmail || "",
      };
      return next();
    }

    return res.status(500).send({ message: "Firebase Admin is not configured" });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.decoded = decoded;
    next();
  } catch {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

app.get("/", (req, res) => {
  res.send("BookCourier server is running");
});

// books
app.get("/books", async (req, res) => {
  try {
    const db = await getDB();
    const booksCollection = db.collection("books");

    const search = req.query.search || "";
    const category = req.query.category || "";
    const availability = req.query.availability || "";
    const sort = req.query.sort || "";
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 0, 0), 50);

    const query = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { author: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
      ];
    }

    if (category) {
      query.category = category;
    }

    if (availability === "available") query.available = { $ne: false };
    if (availability === "unavailable") query.available = false;

    let sortQuery = {};

    if (sort === "asc") sortQuery = { price: 1 };
    if (sort === "desc") sortQuery = { price: -1 };
    if (sort === "newest") sortQuery = { createdAt: -1, _id: -1 };

    let cursor = booksCollection.find(query).sort(sortQuery);
    const total = await booksCollection.countDocuments(query);

    if (limit) {
      cursor = cursor.skip((page - 1) * limit).limit(limit);
    }

    const result = await cursor.toArray();

    if (limit) {
      return res.send({
        data: result,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get books",
      error: error.message,
    });
  }
});

app.get("/book-categories", async (req, res) => {
  try {
    const db = await getDB();
    const booksCollection = db.collection("books");
    const result = await booksCollection
      .aggregate([
        { $match: { category: { $exists: true, $ne: "" } } },
        { $group: { _id: "$category" } },
        { $sort: { _id: 1 } },
      ])
      .toArray();

    res.send(result.map((item) => item._id));
  } catch (error) {
    res.status(500).send({
      message: "Failed to get categories",
      error: error.message,
    });
  }
});

app.get("/latest-books", async (req, res) => {
  try {
    const db = await getDB();
    const booksCollection = db.collection("books");

    const result = await booksCollection
      .find()
      .sort({ _id: -1 })
      .limit(6)
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get latest books",
      error: error.message,
    });
  }
});

app.get("/admin/books", async (req, res) => {
  try {
    const db = await getDB();
    const booksCollection = db.collection("books");

    const result = await booksCollection.find().sort({ _id: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get admin books",
      error: error.message,
    });
  }
});

app.get("/books/:id", async (req, res) => {
  try {
    const db = await getDB();
    const booksCollection = db.collection("books");

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book id" });
    }

    const result = await booksCollection.findOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get book",
      error: error.message,
    });
  }
});

app.post("/books", async (req, res) => {
  try {
    const db = await getDB();
    const booksCollection = db.collection("books");

    const book = req.body;

    const newBook = {
      ...book,
      images: Array.isArray(book.images) ? book.images.filter(Boolean) : [],
      status: book.status || "published",
      available: book.available ?? true,
      createdAt: new Date(),
    };

    const result = await booksCollection.insertOne(newBook);
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to add book",
      error: error.message,
    });
  }
});

app.patch("/books/:id", async (req, res) => {
  try {
    const db = await getDB();
    const booksCollection = db.collection("books");

    const id = req.params.id;
    const updatedBook = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book id" });
    }

    const allowedFields = [
      "title",
      "image",
      "author",
      "category",
      "price",
      "status",
      "available",
      "description",
      "images",
    ];

    const sanitizedUpdate = {};
    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(updatedBook, field)) {
        sanitizedUpdate[field] = updatedBook[field];
      }
    });

    sanitizedUpdate.updatedAt = new Date();

    const result = await booksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: sanitizedUpdate }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update book",
      error: error.message,
    });
  }
});

// contact messages
app.post("/contacts", async (req, res) => {
  try {
    const db = await getDB();
    const contactsCollection = db.collection("contacts");
    const { name, email, subject, message } = req.body;

    if (!name?.trim() || !email?.trim() || !subject?.trim() || !message?.trim()) {
      return res.status(400).send({ message: "All contact fields are required" });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      return res.status(400).send({ message: "A valid email is required" });
    }

    const contactMessage = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim(),
      status: "new",
      createdAt: new Date(),
    };

    const result = await contactsCollection.insertOne(contactMessage);
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to send contact message",
      error: error.message,
    });
  }
});

app.get("/contacts", async (req, res) => {
  try {
    const db = await getDB();
    const contactsCollection = db.collection("contacts");
    const result = await contactsCollection.find().sort({ createdAt: -1 }).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get contact messages",
      error: error.message,
    });
  }
});

app.delete("/books/:id", async (req, res) => {
  try {
    const db = await getDB();
    const booksCollection = db.collection("books");
    const ordersCollection = db.collection("orders");

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book id" });
    }

    await ordersCollection.deleteMany({ bookId: id });

    const result = await booksCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete book",
      error: error.message,
    });
  }
});

// users
app.post("/users", async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");

    const user = req.body;

    if (!user?.email) {
      return res.status(400).send({ message: "Email is required" });
    }

    const existingUser = await usersCollection.findOne({ email: user.email });

    if (existingUser) {
      return res.send({ message: "User already exists", insertedId: null });
    }

    const newUser = {
      ...user,
      role: user.role || "user",
      createdAt: new Date(),
    };

    const result = await usersCollection.insertOne(newUser);
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to save user",
      error: error.message,
    });
  }
});

app.get("/users", async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");

    const result = await usersCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get users",
      error: error.message,
    });
  }
});

app.get("/users/role/:email", async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");

    const email = req.params.email;
    const user = await usersCollection.findOne({ email });

    res.send({ role: user?.role || "user" });
  } catch (error) {
    res.status(500).send({
      message: "Failed to get user role",
      error: error.message,
    });
  }
});

app.patch("/users/:id/role", async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");

    const id = req.params.id;
    const { role } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user id" });
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role } }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update role",
      error: error.message,
    });
  }
});

// orders
app.post("/orders", async (req, res) => {
  try {
    const db = await getDB();
    const ordersCollection = db.collection("orders");

    const order = req.body;

    const newOrder = {
      ...order,
      status: "pending",
      paymentStatus: "unpaid",
      orderDate: new Date(),
    };

    const result = await ordersCollection.insertOne(newOrder);
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to create order",
      error: error.message,
    });
  }
});

app.get("/orders", verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const ordersCollection = db.collection("orders");

    const email = req.query.email;

    if (email && email !== req.decoded.email) {
      return res.status(403).send({ message: "forbidden access" });
    }

    const query = email ? { userEmail: email } : {};

    const result = await ordersCollection
      .find(query)
      .sort({ orderDate: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get orders",
      error: error.message,
    });
  }
});

app.get("/orders/:id", async (req, res) => {
  try {
    const db = await getDB();
    const ordersCollection = db.collection("orders");

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid order id" });
    }

    const result = await ordersCollection.findOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get order",
      error: error.message,
    });
  }
});

app.patch("/orders/:id/cancel", async (req, res) => {
  try {
    const db = await getDB();
    const ordersCollection = db.collection("orders");

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid order id" });
    }

    const result = await ordersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "cancelled" } }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to cancel order",
      error: error.message,
    });
  }
});

app.patch("/orders/:id/status", async (req, res) => {
  try {
    const db = await getDB();
    const ordersCollection = db.collection("orders");

    const id = req.params.id;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid order id" });
    }

    const result = await ordersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update order status",
      error: error.message,
    });
  }
});

app.patch("/orders/:id/pay", async (req, res) => {
  try {
    const db = await getDB();
    const ordersCollection = db.collection("orders");
    const paymentsCollection = db.collection("payments");

    const id = req.params.id;
    const payment = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid order id" });
    }

    const transactionId = `TXN-${Date.now()}`;

    const paymentInfo = {
      ...payment,
      orderId: id,
      transactionId,
      paymentDate: new Date(),
    };

    await paymentsCollection.insertOne(paymentInfo);

    const result = await ordersCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          paymentStatus: "paid",
          transactionId,
        },
      }
    );

    res.send({ ...result, transactionId });
  } catch (error) {
    res.status(500).send({
      message: "Failed to pay order",
      error: error.message,
    });
  }
});

// payments
app.get("/payments", async (req, res) => {
  try {
    const db = await getDB();
    const paymentsCollection = db.collection("payments");

    const email = req.query.email;
    const query = email ? { userEmail: email } : {};

    const result = await paymentsCollection
      .find(query)
      .sort({ paymentDate: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to get payments",
      error: error.message,
    });
  }
});

module.exports = app;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`BookCourier running on port ${port}`);
    
  });
}
