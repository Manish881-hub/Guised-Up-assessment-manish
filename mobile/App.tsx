import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, StyleSheet } from 'react-native';

import FeedScreen from './src/screens/FeedScreen';

// TODO: Replace with real auth token from login/secure-store
const AUTH_TOKEN = '1|LN2jlQw3vja9q3TslpEq7BN8gSLqqNcvmDteswcDd430e2b7';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <FeedScreen authToken={AUTH_TOKEN} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F5F2',
  },
});
