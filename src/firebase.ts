import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  projectId: "mvppos-bcbec",
  appId: "1:536474536970:web:9730f428e77dc8c77063f3",
  apiKey: "AIzaSyB-jhf19I7mSUnLlHgHis6jfHm_oBnUNLE",
  authDomain: "mvppos-bcbec.firebaseapp.com",
  storageBucket: "mvppos-bcbec.firebasestorage.app",
  messagingSenderId: "536474536970",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom database ID if specified, otherwise default
const databaseId = "ai-studio-multitenantposin-ccba55ac-ee1c-490c-b7fa-9603788ba6ef";
export const db = getFirestore(app, databaseId);
export const auth = getAuth(app);
