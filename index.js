require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { ObjectId, getDB } = require("./config/database");
const corsOptions = require("./config/cors");
const { admin, isFirebaseAdminReady } = require("./config/firebase");
const { jwtExpiresIn } = require("./config/auth");
const { verifyAdmin, verifyRole, verifyToken } = require("./middleware/auth.middleware");
const { errorHandler, notFound } = require("./middleware/error.middleware");
const { createToken, getPublicUser, isStrongPassword } = require("./utils/auth");
const contactRoutes = require("./routes/contact.routes");
const healthRoutes = require("./routes/health.routes");

const app = express();
const port = process.env.PORT || 5001;

app.use(cors(corsOptions));
app.use(express.json());
app.use("/", healthRoutes);
app.use("/contacts", contactRoutes);

// books
app.get("/books", async (req, res) => {
  try {
    const db = await getDB();
    const booksCollection = db.collection("books");

    const search = req.query.search || "";
    const category = req.query.category || "";
    const availability = req.query.availability || "";
    const sort = req.query.sort || "";
    const minPrice = Number(req.query.minPrice);
    const maxPrice = Number(req.query.maxPrice);
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

    if (!Number.isNaN(minPrice) || !Number.isNaN(maxPrice)) {
      query.price = {};

      if (!Number.isNaN(minPrice)) query.price.$gte = minPrice;
      if (!Number.isNaN(maxPrice)) query.price.$lte = maxPrice;
    }

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

app.get("/platform-stats", async (req, res) => {
  try {
    const db = await getDB();
    const booksCollection = db.collection("books");
    const usersCollection = db.collection("users");

    const [books, userCount, librarianCount, adminCount] = await Promise.all([
      booksCollection.find().toArray(),
      usersCollection.countDocuments(),
      usersCollection.countDocuments({ role: "librarian" }),
      usersCollection.countDocuments({ role: "admin" }),
    ]);

    const categories = new Set(books.map((book) => book.category).filter(Boolean));

    res.send({
      bookCount: books.length,
      userCount,
      librarianCount,
      adminCount,
      categoryCount: categories.size,
      recentBooks: books
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 4),
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to get platform stats",
      error: error.message,
    });
  }
});

app.get("/dashboard-stats", verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const booksCollection = db.collection("books");
    const usersCollection = db.collection("users");
    const ordersCollection = db.collection("orders");
    const paymentsCollection = db.collection("payments");

    const currentUser = await usersCollection.findOne({ email: req.decoded.email });
    const role = currentUser?.role || "user";
    const isAdmin = role === "admin";
    const isStaff = role === "admin" || role === "librarian";
    const userEmail = req.decoded.email;
    const orderQuery = isStaff ? {} : { userEmail };
    const paymentQuery = isStaff ? {} : { userEmail };

    const [
      totalItems,
      totalUsers,
      totalOrders,
      paidOrders,
      pendingOrders,
      revenueSummary,
      recentOrders,
      recentBooks,
      categoryCounts,
      statusCounts,
      roleCounts,
      monthlyOrders,
      monthlyRevenue,
    ] = await Promise.all([
      booksCollection.countDocuments(),
      isAdmin ? usersCollection.countDocuments() : Promise.resolve(1),
      ordersCollection.countDocuments(orderQuery),
      ordersCollection.countDocuments({ ...orderQuery, paymentStatus: "paid" }),
      ordersCollection.countDocuments({ ...orderQuery, status: "pending" }),
      paymentsCollection
        .aggregate([
          { $match: paymentQuery },
          { $group: { _id: null, total: { $sum: { $ifNull: ["$amount", 0] } } } },
        ])
        .toArray(),
      ordersCollection.find(orderQuery).sort({ orderDate: -1 }).limit(6).toArray(),
      booksCollection.find().sort({ createdAt: -1, _id: -1 }).limit(6).toArray(),
      booksCollection
        .aggregate([
          { $group: { _id: { $ifNull: ["$category", "Uncategorized"] }, count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 8 },
        ])
        .toArray(),
      ordersCollection
        .aggregate([
          { $match: orderQuery },
          { $group: { _id: { $ifNull: ["$status", "pending"] }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
        ])
        .toArray(),
      isAdmin
        ? usersCollection
            .aggregate([
              { $group: { _id: { $ifNull: ["$role", "user"] }, count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ])
            .toArray()
        : Promise.resolve([{ _id: role, count: 1 }]),
      ordersCollection
        .aggregate([
          { $match: orderQuery },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m",
                  date: { $toDate: "$orderDate" },
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
          { $limit: 12 },
        ])
        .toArray(),
      paymentsCollection
        .aggregate([
          { $match: paymentQuery },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m",
                  date: { $toDate: "$paymentDate" },
                },
              },
              total: { $sum: { $ifNull: ["$amount", 0] } },
            },
          },
          { $sort: { _id: 1 } },
          { $limit: 12 },
        ])
        .toArray(),
    ]);

    res.send({
      role,
      cards: {
        totalItems,
        totalUsers,
        revenue: revenueSummary[0]?.total || 0,
        totalOrders,
        paidOrders,
        pendingOrders,
      },
      charts: {
        bar: categoryCounts.map((item) => ({
          label: item._id || "Uncategorized",
          value: item.count,
        })),
        line: monthlyOrders.map((item) => ({
          label: item._id,
          value: item.count,
        })),
        pie: statusCounts.map((item) => ({
          label: item._id || "pending",
          value: item.count,
        })),
        revenue: monthlyRevenue.map((item) => ({
          label: item._id,
          value: item.total,
        })),
        roles: roleCounts.map((item) => ({
          label: item._id || "user",
          value: item.count,
        })),
      },
      recent: {
        orders: recentOrders,
        books: recentBooks,
      },
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to load dashboard stats",
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

app.get("/admin/books", verifyToken, verifyAdmin, async (req, res) => {
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

app.post("/books", verifyToken, verifyRole(["admin", "librarian"]), async (req, res) => {
  try {
    const db = await getDB();
    const booksCollection = db.collection("books");

    const book = req.body;

    const newBook = {
      ...book,
      images: Array.isArray(book.images) ? book.images.filter(Boolean) : [],
      status: book.status || "published",
      available: book.available ?? true,
      librarianEmail: req.decoded.email,
      librarianName: req.currentUser?.name || book.librarianName || "",
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

app.patch("/books/:id", verifyToken, verifyAdmin, async (req, res) => {
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

app.delete("/books/:id", verifyToken, verifyAdmin, async (req, res) => {
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

// authentication
app.post("/auth/register", async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");
    const { name, email, photo, password } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!name?.trim() || !normalizedEmail || !password) {
      return res.status(400).send({ message: "Name, email and password are required" });
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(normalizedEmail)) {
      return res.status(400).send({ message: "A valid email is required" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).send({
        message: "Password must be at least 6 characters and include uppercase and lowercase letters",
      });
    }

    const existingUser = await usersCollection.findOne({ email: normalizedEmail });
    if (existingUser?.passwordHash) {
      return res.status(409).send({ message: "An account already exists with this email" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userDoc = {
      name: name.trim(),
      email: normalizedEmail,
      photo: photo?.trim() || "",
      role: existingUser?.role || "user",
      authProvider: existingUser?.authProvider || "password",
      passwordHash,
      createdAt: existingUser?.createdAt || new Date(),
      updatedAt: new Date(),
    };

    if (existingUser) {
      await usersCollection.updateOne(
        { _id: existingUser._id },
        { $set: userDoc }
      );
      userDoc._id = existingUser._id;
    } else {
      const result = await usersCollection.insertOne(userDoc);
      userDoc._id = result.insertedId;
    }

    res.send({
      token: createToken(userDoc),
      expiresIn: jwtExpiresIn,
      user: getPublicUser(userDoc),
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to register",
      error: error.message,
    });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");
    const { email, password } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).send({ message: "Email and password are required" });
    }

    const demoAccounts = [
      {
        email: "demo.admin@bookcourier.com",
        password: "Admin123",
        name: "Demo Admin",
      },
      {
        email: "ami@tumi.com",
        password: "Amitumi",
        name: "Ami Tumi Admin",
      },
    ];
    const demoAccount = demoAccounts.find(
      (account) =>
        account.email === normalizedEmail && account.password === password
    );

    if (process.env.ENABLE_DEMO_LOGIN !== "false" && demoAccount) {
      const demoUser = await usersCollection.findOne({ email: normalizedEmail });
      const demoPasswordHash = await bcrypt.hash(password, 12);
      const demoUserDoc = {
        name: demoAccount.name,
        email: normalizedEmail,
        photo: "https://i.ibb.co.com/4pDNDk1/avatar.png",
        role: "admin",
        authProvider: "password",
        passwordHash: demoPasswordHash,
        updatedAt: new Date(),
        lastLoginAt: new Date(),
      };

      if (demoUser) {
        await usersCollection.updateOne(
          { _id: demoUser._id },
          { $set: demoUserDoc }
        );
        demoUserDoc._id = demoUser._id;
        demoUserDoc.createdAt = demoUser.createdAt;
      } else {
        demoUserDoc.createdAt = new Date();
        const result = await usersCollection.insertOne(demoUserDoc);
        demoUserDoc._id = result.insertedId;
      }

      return res.send({
        token: createToken(demoUserDoc),
        expiresIn: jwtExpiresIn,
        user: getPublicUser(demoUserDoc),
      });
    }

    const user = await usersCollection.findOne({ email: normalizedEmail });
    if (!user?.passwordHash) {
      return res.status(401).send({ message: "Invalid email or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).send({ message: "Invalid email or password" });
    }

    await usersCollection.updateOne(
      { _id: user._id },
      { $set: { lastLoginAt: new Date() } }
    );

    res.send({
      token: createToken(user),
      expiresIn: jwtExpiresIn,
      user: getPublicUser(user),
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to login",
      error: error.message,
    });
  }
});

app.post("/auth/google", async (req, res) => {
  try {
    if (!isFirebaseAdminReady()) {
      return res.status(503).send({ message: "Google login is not configured" });
    }

    const db = await getDB();
    const usersCollection = db.collection("users");
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).send({ message: "Google ID token is required" });
    }

    const decodedGoogleUser = await admin.auth().verifyIdToken(idToken);
    const normalizedEmail = decodedGoogleUser.email?.trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(400).send({ message: "Google account email is required" });
    }

    const existingUser = await usersCollection.findOne({ email: normalizedEmail });
    const userDoc = {
      name: decodedGoogleUser.name?.trim() || existingUser?.name || "BookCourier User",
      email: normalizedEmail,
      photo: decodedGoogleUser.picture?.trim() || existingUser?.photo || "",
      role: existingUser?.role || "user",
      authProvider: existingUser?.authProvider || "google",
      updatedAt: new Date(),
      lastLoginAt: new Date(),
    };

    if (existingUser) {
      await usersCollection.updateOne(
        { _id: existingUser._id },
        { $set: userDoc, $setOnInsert: { createdAt: new Date() } }
      );
      userDoc._id = existingUser._id;
      userDoc.createdAt = existingUser.createdAt;
    } else {
      userDoc.createdAt = new Date();
      const result = await usersCollection.insertOne(userDoc);
      userDoc._id = result.insertedId;
    }

    res.send({
      token: createToken(userDoc),
      expiresIn: jwtExpiresIn,
      user: getPublicUser(userDoc),
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to complete Google login",
      error: error.message,
    });
  }
});

app.get("/auth/me", verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");
    const user = await usersCollection.findOne({ email: req.decoded.email });

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    res.send({ user: getPublicUser(user) });
  } catch (error) {
    res.status(500).send({
      message: "Failed to get current user",
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

    const normalizedEmail = user.email.trim().toLowerCase();
    const existingUser = await usersCollection.findOne({ email: normalizedEmail });

    if (existingUser) {
      return res.send({ message: "User already exists", insertedId: null });
    }

    const newUser = {
      ...user,
      email: normalizedEmail,
      role: user.role || "user",
      authProvider: user.authProvider || "google",
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

app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");

    const result = await usersCollection
      .find()
      .project({ passwordHash: 0 })
      .toArray();
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

app.patch("/users/profile", verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");
    const { name, photo } = req.body;

    if (!name?.trim() || !photo?.trim()) {
      return res.status(400).send({ message: "Name and photo URL are required" });
    }

    const result = await usersCollection.updateOne(
      { email: req.decoded.email },
      {
        $set: {
          name: name.trim(),
          photo: photo.trim(),
          updatedAt: new Date(),
        },
      }
    );

    const updatedUser = await usersCollection.findOne({ email: req.decoded.email });

    res.send({
      ...result,
      user: getPublicUser(updatedUser),
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to update profile",
      error: error.message,
    });
  }
});

app.patch("/users/password", verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).send({ message: "Current and new password are required" });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).send({
        message: "Password must be at least 6 characters and include uppercase and lowercase letters",
      });
    }

    const user = await usersCollection.findOne({ email: req.decoded.email });
    if (!user?.passwordHash) {
      return res.status(400).send({ message: "Password update is available for password accounts only" });
    }

    const passwordMatches = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatches) {
      return res.status(401).send({ message: "Current password is incorrect" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    const result = await usersCollection.updateOne(
      { email: req.decoded.email },
      { $set: { passwordHash, updatedAt: new Date() } }
    );

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to update password",
      error: error.message,
    });
  }
});

app.patch("/users/:id/role", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");

    const id = req.params.id;
    const { role } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user id" });
    }

    if (!["user", "admin", "librarian"].includes(role)) {
      return res.status(400).send({ message: "Invalid role" });
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

app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const db = await getDB();
    const usersCollection = db.collection("users");
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid user id" });
    }

    const user = await usersCollection.findOne({ _id: new ObjectId(id) });
    if (user?.email === req.decoded.email) {
      return res.status(400).send({ message: "You cannot delete your own account" });
    }

    const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to delete user",
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
    const usersCollection = db.collection("users");

    const email = req.query.email;

    if (email && email !== req.decoded.email) {
      return res.status(403).send({ message: "forbidden access" });
    }

    let query = email ? { userEmail: email } : {};

    if (!email) {
      const currentUser = await usersCollection.findOne({ email: req.decoded.email });

      if (currentUser?.role !== "admin" && currentUser?.role !== "librarian") {
        query = { userEmail: req.decoded.email };
      }
    }

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

app.patch("/orders/:id/cancel", verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const ordersCollection = db.collection("orders");
    const usersCollection = db.collection("users");

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid order id" });
    }

    const order = await ordersCollection.findOne({ _id: new ObjectId(id) });
    const currentUser = await usersCollection.findOne({ email: req.decoded.email });

    if (
      order?.userEmail !== req.decoded.email &&
      currentUser?.role !== "admin" &&
      currentUser?.role !== "librarian"
    ) {
      return res.status(403).send({ message: "forbidden access" });
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

app.patch("/orders/:id/status", verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const ordersCollection = db.collection("orders");
    const usersCollection = db.collection("users");

    const id = req.params.id;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid order id" });
    }

    const currentUser = await usersCollection.findOne({ email: req.decoded.email });
    if (currentUser?.role !== "admin" && currentUser?.role !== "librarian") {
      return res.status(403).send({ message: "admin access required" });
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

app.patch("/orders/:id/pay", verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const ordersCollection = db.collection("orders");
    const paymentsCollection = db.collection("payments");

    const id = req.params.id;
    const payment = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid order id" });
    }

    const order = await ordersCollection.findOne({ _id: new ObjectId(id) });
    if (order?.userEmail !== req.decoded.email) {
      return res.status(403).send({ message: "forbidden access" });
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

app.use(notFound);
app.use(errorHandler);

module.exports = app;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`BookCourier running on port ${port}`);
    
  });
}
