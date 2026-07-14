import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  AppleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from '@react-native-firebase/auth';
import { auth } from '@/firebase';
import { firebaseErrorKey } from '@/lib/firebase-errors';
import { colors, spacing, typography, radii } from '@/theme';

type Mode = 'sign-in' | 'create-account';

// Brand logo mark: 九 (kyu) over 八 (hachi), set in Klee One. Not a translatable
// string: it's the app's visual identity and renders identically in every locale.
const BRAND_MARK = '九\n八';

export default function SignIn() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAppleSignIn() {
    try {
      setLoading(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        Alert.alert(t('signIn.alertFailedSignIn'), t('signIn.errorNoAppleToken'));
        return;
      }
      const appleCredential = AppleAuthProvider.credential(credential.identityToken);
      await signInWithCredential(auth, appleCredential);
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'ERR_REQUEST_CANCELED') {
        return; // user dismissed the Apple sheet
      }
      Alert.alert(t('signIn.alertFailedSignIn'), t(firebaseErrorKey(error)));
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailAuth() {
    if (!email.trim() || !password) return;
    try {
      setLoading(true);
      if (mode === 'sign-in') {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (error: unknown) {
      const title = mode === 'sign-in' ? t('signIn.alertFailedSignIn') : t('signIn.alertFailedCreate');
      Alert.alert(title, t(firebaseErrorKey(error)));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.container}>
        <View style={styles.brandMark}>
          <Text style={styles.brandGlyph}>{BRAND_MARK}</Text>
        </View>
        <Text style={styles.title}>{t('signIn.title')}</Text>

        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radii.md}
          style={styles.appleButton}
          onPress={handleAppleSignIn}
        />

        <Text style={styles.divider}>{t('signIn.divider')}</Text>

        <TextInput
          style={styles.input}
          placeholder={t('signIn.emailPlaceholder')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder={t('signIn.passwordPlaceholder')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
          textContentType={mode === 'sign-in' ? 'password' : 'newPassword'}
          editable={!loading}
        />

        <Pressable
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
          onPress={handleEmailAuth}
          disabled={!canSubmit}
        >
          <Text style={styles.buttonText}>
            {mode === 'sign-in' ? t('signIn.submitSignIn') : t('signIn.submitCreate')}
          </Text>
        </Pressable>

        <Pressable
          style={styles.toggle}
          onPress={() => setMode(mode === 'sign-in' ? 'create-account' : 'sign-in')}
          disabled={loading}
        >
          <Text style={styles.toggleText}>
            {mode === 'sign-in'
              ? t('signIn.toggleToCreate')
              : t('signIn.toggleToSignIn')}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing[8],
  },
  brandMark: {
    width: 88, // decorative logo tile; mirrors the app icon proportions
    height: 88,
    borderRadius: radii.xl,
    backgroundColor: colors.brand,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[5],
  },
  brandGlyph: {
    fontFamily: typography.fonts.brand,
    fontSize: typography.sizes.xxxl,
    lineHeight: 30, // tight stack so 九 and 八 read as one mark
    textAlign: 'center',
    color: colors.brandGlyph,
  },
  title: {
    fontSize: typography.sizes.xxl,
    fontWeight: typography.weights.bold,
    textAlign: 'center',
    marginBottom: spacing[12],
  },
  appleButton: {
    width: '100%',
    height: 44, // Apple HIG minimum touch target
  },
  divider: {
    textAlign: 'center',
    marginVertical: spacing[5],
    color: colors.textPlaceholder,
    fontSize: typography.sizes.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    marginBottom: spacing[3],
    fontSize: typography.sizes.md,
    backgroundColor: colors.backgroundElevated,
  },
  button: {
    backgroundColor: colors.actionPrimary,
    borderRadius: radii.md,
    paddingVertical: spacing[4],
    marginTop: spacing[1],
    marginBottom: spacing[4],
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: colors.actionPrimaryText,
    textAlign: 'center',
    fontSize: typography.sizes.md,
    fontWeight: typography.weights.semibold,
  },
  toggle: {
    paddingVertical: spacing[2],
  },
  toggleText: {
    textAlign: 'center',
    color: colors.textTertiary,
    fontSize: typography.sizes.sm,
  },
});
