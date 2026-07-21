import { StatusBar } from 'expo-status-bar';

import DevPriceSyncScreen from './src/ui/screens/DevPriceSyncScreen';

export default function App() {
  return (
    <>
      <DevPriceSyncScreen />
      <StatusBar style="auto" />
    </>
  );
}
