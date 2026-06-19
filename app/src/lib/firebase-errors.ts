/**
 * Map a Firebase error to a user-facing i18n key.
 *
 * Firebase's `error.message` is always English SDK text. To keep alerts in the
 * user's language we never surface that message directly: instead we read the
 * stable `error.code`, map the codes a user can actually hit to a localized key,
 * and fall back to a generic message for everything else (rare, technical codes).
 *
 * Returns the *key*, not the translated string, so call sites keep calling
 * `t()` directly per the project's i18n rules:
 *
 *   Alert.alert(t('signIn.alertFailedSignIn'), t(firebaseErrorKey(error)));
 */
export function firebaseErrorKey(error: unknown): string {
  const code =
    error instanceof Error && 'code' in error ? (error as { code: string }).code : '';

  switch (code) {
    // Modern Firebase Auth collapses wrong-password / user-not-found into
    // invalid-credential, but older SDKs and emulators still emit the split codes.
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'common.errorInvalidCredentials';
    case 'auth/invalid-email':
      return 'common.errorInvalidEmail';
    case 'auth/email-already-in-use':
      return 'common.errorEmailInUse';
    case 'auth/weak-password':
      return 'common.errorWeakPassword';
    case 'auth/too-many-requests':
      return 'common.errorTooManyRequests';
    case 'auth/network-request-failed':
    case 'firestore/unavailable':
      return 'common.errorNetwork';
    default:
      return 'common.errorGeneric';
  }
}
