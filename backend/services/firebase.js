import admin from "firebase-admin";

let firebaseApp = null;

export function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;

  const projectId = process.env.FCM_PROJECT_ID;
  const clientEmail = process.env.FCM_CLIENT_EMAIL;
  const privateKey = process.env.FCM_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn("Firebase credentials not configured — FCM pushes disabled");
    return null;
  }

  try {
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, "\n"),
      }),
    });
    console.log("Firebase Admin SDK initialized");
  } catch (err) {
    console.error("Failed to initialize Firebase Admin SDK:", err.message);
    return null;
  }

  return firebaseApp;
}

export function getMessaging() {
  const app = getFirebaseApp();
  if (!app) return null;
  return admin.messaging(app);
}
