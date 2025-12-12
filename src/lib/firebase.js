import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBxKmVXmP7fZ9LnZ8xQhZQqR5nE8cVxGHE",
  authDomain: "music-player-demo.firebaseapp.com",
  // Updated Realtime Database URL
  databaseURL: "https://ai-music-6f8ba-default-rtdb.firebaseio.com/",
  projectId: "music-player-demo",
  storageBucket: "music-player-demo.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456789012",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database
export const db = getDatabase(app);

// Initialize Auth
export const auth = getAuth(app);

export default app;
