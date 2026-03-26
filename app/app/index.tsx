import { View, Text, Pressable, StyleSheet } from 'react-native';
import auth from '@react-native-firebase/auth';
import { useAuth } from '../src/context/AuthContext';

export default function Home() {
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Kyuhachi</Text>
      <Text style={styles.subtitle}>{user?.email ?? user?.displayName ?? ''}</Text>
      <Pressable style={styles.signOut} onPress={() => auth().signOut()}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 40,
  },
  signOut: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  signOutText: {
    fontSize: 14,
    color: '#333',
  },
});
