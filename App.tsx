import { StatusBar } from 'expo-status-bar';

import DevCheckScreen from './src/ui/screens/DevCheckScreen';

export default function App() {
  return (
    <>
      <DevCheckScreen />
      <StatusBar style="auto" />
    </>
  );
}
