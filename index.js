const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.dvhvhcc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let booksCollection;
let ordersCollection;

async function connectDB() {
  try {
    await client.connect();

    const db = client.db("bookcourierDB");

    booksCollection = db.collection("books");
    ordersCollection = db.collection("orders");

    console.log("MongoDB Connected");
  } catch (error) {
    console.log(error);
  }
}

connectDB();

app.get("/", (req, res) => {
  res.send("BookCourier server is running");
});

app.get("/books", async (req, res) => {
  try {
    const result = await booksCollection.find().toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to get books" });
  }
});

app.get("/books/:id", async (req, res) => {
  try {
    const id = req.params.id;

    const query = { _id: new ObjectId(id) };

    const result = await booksCollection.findOne(query);

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to get book" });
  }
});

app.post("/books", async (req, res) => {
  try {
    const book = req.body;

    const result = await booksCollection.insertOne(book);

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to add book" });
  }
});

app.post("/orders", async (req, res) => {
  try {
    const order = req.body;

    const result = await ordersCollection.insertOne(order);

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to place order" });
  }
});

app.get("/orders", async (req, res) => {
  try {
    const email = req.query.email;

    const query = {
      userEmail: email,
    };

    const result = await ordersCollection.find(query).toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to get orders" });
  }
});

app.patch("/orders/:id/cancel", async (req, res) => {
  try {
    const id = req.params.id;

    const query = {
      _id: new ObjectId(id),
    };

    const updateDoc = {
      $set: {
        status: "cancelled",
      },
    };

    const result = await ordersCollection.updateOne(query, updateDoc);

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to cancel order" });
  }
});

app.patch("/orders/:id/pay", async (req, res) => {
  try {
    const id = req.params.id;

    const query = {
      _id: new ObjectId(id),
    };

    const updateDoc = {
      $set: {
        paymentStatus: "paid",
      },
    };

    const result = await ordersCollection.updateOne(query, updateDoc);

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to pay order" });
  }
});

module.exports = app;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
}