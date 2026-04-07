import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onUserCreated } from './triggers/onUserCreated';
export { onVisitCreated } from './triggers/onVisitCreated';
