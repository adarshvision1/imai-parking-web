import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyBzvu6RbIWB3WisORrJBaZdZAD8YIuPR18',
  authDomain: 'imai-parking.firebaseapp.com',
  projectId: 'imai-parking',
  storageBucket: 'imai-parking.appspot.com',
  messagingSenderId: '729240789760',
  appId: '1:729240789760:web:76bf95752d740d8af3c9e5'
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
