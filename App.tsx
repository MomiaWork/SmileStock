import { StatusBar } from 'expo-status-bar';

import DevBackgroundScreen from './src/ui/screens/DevBackgroundScreen';

export default function App() {
  return (
    <>
      <DevBackgroundScreen />
      <StatusBar style="auto" />
    </>
  );
}
