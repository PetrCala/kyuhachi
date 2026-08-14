import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

/**
 * Public Firebase web-app identifiers, not secrets: every Firebase web client
 * ships them. Access control lives entirely in firebase/firestore.rules.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyBDvWpl1Dk9jr2ACtTHBDxW_QBUenqQnUI',
  authDomain: 'kyuhachi-fddcc.firebaseapp.com',
  projectId: 'kyuhachi-fddcc',
  storageBucket: 'kyuhachi-fddcc.firebasestorage.app',
  messagingSenderId: '1014160585473',
  appId: '1:1014160585473:web:34b7ebcc52178bb2eb2100',
};

const app = initializeApp(firebaseConfig);

/** The site reads Firestore unauthenticated; there is no sign-in anywhere. */
export const db = getFirestore(app);
