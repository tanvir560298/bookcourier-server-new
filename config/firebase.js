const admin = require("firebase-admin");

let firebaseAdminReady = false;

if (!admin.apps.length) {
  try {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : require("../firebase-admin-key.json");

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    firebaseAdminReady = true;
  } catch {
    console.warn(
      "Firebase Admin is not configured. Protected Firebase token routes will be unavailable."
    );
  }
} else {
  firebaseAdminReady = true;
}

module.exports = {
  admin,
  isFirebaseAdminReady: () => firebaseAdminReady,
};
