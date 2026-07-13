import {
  View,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useState } from 'react';

import FeedScreen from './src/screens/FeedScreen';

const TOKEN_KEY = 'auth_token';
const FALLBACK_TOKEN = '1|LN2jlQw3vja9q3TslpEq7BN8gSLqqNcvmDteswcDd430e2b7';

export default function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      let token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) {
        token = FALLBACK_TOKEN;
        await SecureStore.setItemAsync(TOKEN_KEY, token);
      }
      setAuthToken(token);
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#E4572E" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FeedScreen authToken={authToken!} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
