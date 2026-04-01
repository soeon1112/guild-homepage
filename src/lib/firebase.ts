import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCmDJJhG39BmmSi0IAw2SVC8a1RMR7T97k",
  authDomain: "dawnlight-guild.firebaseapp.com",
  projectId: "dawnlight-guild",
  storageBucket: "dawnlight-guild.firebasestorage.app",
  messagingSenderId: "65292198756",
  appId: "1:65292198756:web:e7c4a946488c8796ce9071"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
