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
import * as AppleAuthentication from 'expo-apple-authentication';
import auth from '@react-native-firebase/auth';
import { colors, spacing, typography, radii } from '../src/theme';

type Mode = 'sign-in' | 'create-account';

export default function SignIn() {
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
      if (!credential.identityToken) throw new Error('No identity token from Apple');
      const appleCredential = auth.AppleAuthProvider.credential(credential.identityToken);
      await auth().signInWithCredential(appleCredential);
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'ERR_REQUEST_CANCELED') {
        return; // user dismissed the Apple sheet
      }
      Alert.alert('Sign in failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailAuth() {
    if (!email.trim() || !password) return;
    try {
      setLoading(true);
      if (mode === 'sign-in') {
        await auth().signInWithEmailAndPassword(email.trim(), password);
      } else {
        await auth().createUserWithEmailAndPassword(email.trim(), password);
      }
    } catch (error: unknown) {
      const title = mode === 'sign-in' ? 'Sign in failed' : 'Account creation failed';
      Alert.alert(title, error instanceof Error ? error.message : 'Unknown error');
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
        <Text style={styles.title}>九州八十八湯</Text>

        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={radii.md}
          style={styles.appleButton}
          onPress={handleAppleSignIn}
        />

        <Text style={styles.divider}>or</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
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
          placeholder="Password"
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
            {mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Text>
        </Pressable>

        <Pressable
          style={styles.toggle}
          onPress={() => setMode(mode === 'sign-in' ? 'create-account' : 'sign-in')}
          disabled={loading}
        >
          <Text style={styles.toggleText}>
            {mode === 'sign-in'
              ? "Don't have an account? Create one"
              : 'Already have an account? Sign in'}
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
