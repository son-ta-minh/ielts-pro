import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "vocabpro-5604c",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export async function getCurrentHost() {
  try {
    const docRef = doc(db, "vocabpro", "server");

    const snap = await getDoc(docRef);

    console.log("Received response from Firestore:", snap.exists() ? snap.data() : "No document");

    if (!snap.exists()) {
      console.log("Document does not exist");
      return null;
    }

    const data = snap.data();
    return {
      host: data.host || null,
      local: data.local || null,
    };
  } catch (err) {
    console.error("Firebase error:", err);
    return null;
  }
}