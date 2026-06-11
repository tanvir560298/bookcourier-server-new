const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mfz0bkx.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

let MongoObjectId;
let client;
let database;

function getMongo() {
  const mongodb = require("mongodb");
  MongoObjectId = MongoObjectId || mongodb.ObjectId;

  if (!client) {
    client = new mongodb.MongoClient(uri, {
      serverApi: {
        version: mongodb.ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
  }

  return { ObjectId: MongoObjectId };
}

function ObjectId(value) {
  const { ObjectId: RealObjectId } = getMongo();
  return new RealObjectId(value);
}

ObjectId.isValid = (value) => {
  const { ObjectId: RealObjectId } = getMongo();
  return RealObjectId.isValid(value);
};

async function getDB() {
  getMongo();

  if (!database) {
    await client.connect();
    database = client.db(process.env.DB_NAME || "bookCourierDB");
  }

  return database;
}

module.exports = {
  ObjectId,
  getDB,
};
