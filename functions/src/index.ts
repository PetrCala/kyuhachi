import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onUserCreated } from './triggers/onUserCreated';
