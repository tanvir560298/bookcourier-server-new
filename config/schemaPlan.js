const collections = {
  users: {
    fields: ["name", "email", "photo", "role", "authProvider", "passwordHash", "createdAt", "updatedAt"],
    indexes: [{ email: 1, unique: true }, { role: 1 }],
    relationships: ["orders.userEmail -> users.email", "payments.userEmail -> users.email"],
  },
  books: {
    fields: ["title", "author", "category", "price", "image", "images", "status", "available", "librarianEmail", "createdAt"],
    indexes: [{ title: "text", author: "text", category: "text" }, { category: 1 }, { status: 1 }],
    relationships: ["orders.bookId -> books._id"],
  },
  orders: {
    fields: ["bookId", "bookTitle", "userEmail", "status", "paymentStatus", "price", "orderDate"],
    indexes: [{ userEmail: 1 }, { status: 1 }, { paymentStatus: 1 }, { orderDate: -1 }],
    relationships: ["orders.bookId -> books._id", "orders.userEmail -> users.email"],
  },
  payments: {
    fields: ["orderId", "transactionId", "amount", "userEmail", "paymentDate"],
    indexes: [{ userEmail: 1 }, { orderId: 1 }, { transactionId: 1 }],
    relationships: ["payments.orderId -> orders._id", "payments.userEmail -> users.email"],
  },
  contacts: {
    fields: ["name", "email", "subject", "message", "status", "createdAt"],
    indexes: [{ email: 1 }, { status: 1 }, { createdAt: -1 }],
    relationships: [],
  },
};

module.exports = {
  collections,
};
