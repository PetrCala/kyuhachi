import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { onUserCreated } from './triggers/onUserCreated';
export { onUserDeleted } from './triggers/onUserDeleted';
export { onVisitCreated } from './triggers/onVisitCreated';
export { onVisitDeleted } from './triggers/onVisitDeleted';
export { claimTier } from './callables/claimTier';
