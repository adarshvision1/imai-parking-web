import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyB55iGM7Q9P-vYOzfzeitBmW3mz0liIAMI",
  authDomain: "imai-parking-32b83.firebaseapp.com",
  projectId: "imai-parking-32b83",
  storageBucket: "imai-parking-32b83.firebasestorage.app",
  messagingSenderId: "284732598918",
  appId: "1:284732598918:web:5c69b7999d9fdec670bf07",
  measurementId: "G-X6S4HJFQM9"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
