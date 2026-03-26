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
          cornerRadius={8}
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
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 48,
  },
  appleButton: {
    width: '100%',
    height: 44,
  },
  divider: {
    textAlign: 'center',
    marginVertical: 20,
    color: '#999',
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  button: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    paddingVertical: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  toggle: {
    paddingVertical: 8,
  },
  toggleText: {
    textAlign: 'center',
    color: '#555',
    fontSize: 14,
  },
});
