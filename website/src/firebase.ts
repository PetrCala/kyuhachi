import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';

/**
 * Public Firebase web-app identifiers, not secrets: every Firebase web client
 * ships them. Access control lives entirely in firebase/firestore.rules and
 * firebase/database.rules.json.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyBDvWpl1Dk9jr2ACtTHBDxW_QBUenqQnUI',
  authDomain: 'kyuhachi-fddcc.firebaseapp.com',
  projectId: 'kyuhachi-fddcc',
  // The default RTDB instance (viewer presence only; see database.rules.json).
  databaseURL: 'https://kyuhachi-fddcc-default-rtdb.firebaseio.com',
  storageBucket: 'kyuhachi-fddcc.firebasestorage.app',
  messagingSenderId: '1014160585473',
  appId: '1:1014160585473:web:34b7ebcc52178bb2eb2100',
};

const app = initializeApp(firebaseConfig);

/** The site reads Firestore unauthenticated; there is no sign-in anywhere. */
export const db = getFirestore(app);

/** Realtime Database, used solely for the "viewing now" presence counter. */
export const rtdb = getDatabase(app);
