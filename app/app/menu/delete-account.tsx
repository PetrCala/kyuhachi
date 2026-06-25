import { useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  AppleAuthProvider,
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  type FirebaseAuthTypes,
} from '@react-native-firebase/auth';
import { useAuth } from '@/context/AuthContext';
import { auth } from '@/firebase';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import { colors, spacing, typography, radii } from '@/theme';

// Canonical Firebase provider id for email/password accounts. Used only to pick
// the re-authentication path — not user-facing copy, so exempt from the i18n rule.
const PASSWORD_PROVIDER_ID = 'password';

// expo-apple-authentication throws this code when the user dismisses the Apple
// sheet (mirrors the handling in app/app/sign-in.tsx).
const APPLE_CANCEL_CODE = 'ERR_REQUEST_CANCELED';

export default function DeleteAccount() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Email/password accounts re-authenticate with the typed password; Apple
  // accounts re-authenticate by presenting the Apple sheet again. Account
  // linking is not offered, so a user has exactly one of these providers.
  const isPasswordUser =
    user?.providerData.some((p) => p.providerId === PASSWORD_PROVIDER_ID) ?? false;

  async function reauthenticate(currentUser: FirebaseAuthTypes.User) {
    if (isPasswordUser) {
      const credential = EmailAuthProvider.credential(currentUser.email ?? '', password);
      await reauthenticateWithCredential(currentUser, credential);
      return;
    }
    const appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!appleCredential.identityToken) {
      throw new Error('Apple did not return an identity token');
    }
    await reauthenticateWithCredential(
      currentUser,
      AppleAuthProvider.credential(appleCredential.identityToken),
    );
  }

  async function runDelete() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setBusy(true);
    try {
      // Deleting an account requires a recent sign-in, so re-authenticate up
      // front rather than reacting to an auth/requires-recent-login failure.
      await reauthenticate(currentUser);
      await deleteUser(currentUser);
      // onAuthStateChanged then fires with null and the root navigator redirects
      // to /sign-in. The onUserDeleted Cloud Function erases this user's
      // Firestore documents and Storage photos server-side, so there is nothing
      // left to clean up here.
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code: string }).code === APPLE_CANCEL_CODE
      ) {
        setBusy(false);
        return; // user backed out of the Apple sheet — not an error
      }
      Alert.alert(t('deleteAccount.errorTitle'), t(firebaseErrorKey(error)));
      setBusy(false);
    }
  }

  function confirmDelete() {
    Alert.alert(t('deleteAccount.confirmTitle'), t('deleteAccount.confirmMessage'), [
      { text: t('deleteAccount.cancel'), style: 'cancel' },
      { text: t('deleteAccount.confirm'), style: 'destructive', onPress: runDelete },
    ]);
  }

  const canDelete = !busy && (!isPasswordUser || password.length > 0);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('deleteAccount.title'), headerShown: true }} />

      <View style={styles.iconWrap}>
        <Ionicons name="warning-outline" size={typography.sizes.xxxl} color={colors.destructive} />
      </View>
      <Text style={styles.heading}>{t('deleteAccount.heading')}</Text>

      <View style={styles.card}>
        <Text style={styles.body}>{t('deleteAccount.body')}</Text>
        <Bullet label={t('deleteAccount.bullet1')} />
        <Bullet label={t('deleteAccount.bullet2')} />
        <Bullet label={t('deleteAccount.bullet3')} />
        <Text style={styles.irreversible}>{t('deleteAccount.irreversible')}</Text>
      </View>

      {isPasswordUser ? (
        <>
          <Text style={styles.sectionHeader}>{t('deleteAccount.passwordLabel')}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={t('deleteAccount.passwordPlaceholder')}
            placeholderTextColor={colors.textPlaceholder}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            editable={!busy}
          />
          <Text style={styles.hint}>{t('deleteAccount.passwordHint')}</Text>
        </>
      ) : (
        <Text style={styles.hint}>{t('deleteAccount.appleHint')}</Text>
      )}

      <Pressable
        style={[styles.deleteButton, !canDelete && styles.deleteButtonDisabled]}
        onPress={confirmDelete}
        disabled={!canDelete}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color={colors.textInverted} />
        ) : (
          <Text style={styles.deleteButtonText}>{t('deleteAccount.button')}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

function Bullet({ label }: { label: string }) {
  return (
    <View style={styles.bulletRow}>
      <Ionicons
        name="close-circle"
        size={typography.sizes.md}
        color={colors.destructive}
        style={styles.bulletIcon}
      />
      <Text style={styles.bulletText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.backgroundSecondary,
  },
  content: {
    padding: spacing[4],
    paddingBottom: spacing[10],
  },
  iconWrap: {
    alignItems: 'center',
    paddingTop: spacing[6],
    paddingBottom: spacing[3],
  },
  heading: {
    fontSize: typography.sizes.xl,
    fontWeight: typography.weights.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing[5],
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    padding: spacing[4],
  },
  body: {
    fontSize: typography.sizes.md,
    lineHeight: 22,
    color: colors.textPrimary,
    marginBottom: spacing[3],
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing[2],
  },
  bulletIcon: {
    marginRight: spacing[2],
    marginTop: spacing[1],
  },
  bulletText: {
    flex: 1,
    fontSize: typography.sizes.md,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  irreversible: {
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.semibold,
    color: colors.destructive,
    marginTop: spacing[2],
  },
  sectionHeader: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[6],
    marginBottom: spacing[2],
    marginLeft: spacing[4],
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    fontSize: typography.sizes.md,
    color: colors.textPrimary,
    backgroundColor: colors.backgroundElevated,
  },
  hint: {
    fontSize: typography.sizes.sm,
    color: colors.textMuted,
    marginTop: spacing[2],
    marginLeft: spacing[4],
    marginRight: spacing[4],
  },
  deleteButton: {
    backgroundColor: colors.destructive,
    borderRadius: radii.md,
    paddingVertical: spacing[4],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing[8],
  },
  deleteButtonDisabled: {
    opacity: 0.4,
  },
  deleteButtonText: {
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
    color: colors.textInverted,
  },
});
