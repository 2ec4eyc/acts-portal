import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8"));

// Initialize Firebase Admin
try {
  admin.initializeApp({
    projectId: firebaseConfig.projectId
  });
} catch (e) {
  console.error("Firebase Admin initialization failed:", e);
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to update user password (Admin only)
  app.post("/api/admin/update-password", async (req, res) => {
    const { uid, newPassword, idToken } = req.body;

    if (!uid || !newPassword || !idToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    try {
      // Verify the requester is an admin
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const requesterUid = decodedToken.uid;
      
      // Check if requester is admin in Firestore
      const userDoc = await db.collection("users").doc(requesterUid).get();
      const userData = userDoc.data();

      // Hardcoded admin check for the main admin email too
      const isHardcodedAdmin = ['eychavez14@gmail.com', 'actsportal2026@gmail.com'].includes(decodedToken.email || '');

      if (userData?.role !== 'admin' && !isHardcodedAdmin) {
        return res.status(403).json({ error: "Unauthorized. Admin role required." });
      }

      // Update the target user's password
      await admin.auth().updateUser(uid, {
        password: newPassword
      });

      res.json({ success: true, message: "Password updated successfully" });
    } catch (error: any) {
      console.error("Error updating password:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // API Route to update user email (Admin only)
  app.post("/api/admin/update-email", async (req, res) => {
    const { uid, newEmail, idToken, collection = "users" } = req.body;

    if (!uid || !newEmail || !idToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    if (!["users", "archived_users"].includes(collection)) {
      return res.status(400).json({ error: "Invalid collection" });
    }

    try {
      // Verify the requester is an admin
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const requesterUid = decodedToken.uid;

      // Check if requester is admin in Firestore
      const userDoc = await db.collection("users").doc(requesterUid).get();
      const userData = userDoc.data();

      // Hardcoded admin check for the main admin email too
      const isHardcodedAdmin = ['eychavez14@gmail.com', 'actsportal2026@gmail.com'].includes(decodedToken.email || '');

      if (userData?.role !== 'admin' && !isHardcodedAdmin) {
        return res.status(403).json({ error: "Unauthorized. Admin role required." });
      }

      // Update the target user's email in Firebase Auth
      await admin.auth().updateUser(uid, {
        email: newEmail
      });

      // Update the target user's email in Firestore
      await db.collection(collection).doc(uid).update({
        email: newEmail
      });

      res.json({ success: true, message: "Email updated successfully" });
    } catch (error: any) {
      console.error("Error updating email:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Serve /api/* through the same dispatcher as the Vercel Function (api/index.ts).
  app.all("/api/{*route}", async (req, res) => {
    const { dispatch } = await import("./server/routes/index.js");
    try {
      await dispatch(req.path.replace(/^\/api\/?/, ""), req as never, res as never);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.status(500).json({ error: "Internal error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('/{*path}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
