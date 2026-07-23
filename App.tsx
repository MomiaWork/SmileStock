import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { registerBackgroundTaskAsync } from './src/background/background-fetch-task';
import { startForegroundPoll } from './src/background/foreground-poll';
import { getDb } from './src/db/schema';
import { getGlobalDefaultIntervalSec } from './src/db/settings-repo';
import I18nProvider from './src/i18n/I18nProvider';
import RootNavigator from './src/ui/navigation/RootNavigator';

export default function App() {
  useEffect(() => {
    void (async () => {
      const db = await getDb();
      const intervalSec = await getGlobalDefaultIntervalSec(db);
      startForegroundPoll(intervalSec);
      try {
        await registerBackgroundTaskAsync();
      } catch {
        // best-effort：不支援背景任務的平台（例如 web）會直接丟錯，忽略即可
      }
    })();
  }, []);

  return (
    <I18nProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </I18nProvider>
  );
}
