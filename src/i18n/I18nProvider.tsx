import { useEffect, useMemo, useState } from 'react';

import { getDb } from '../db/schema';
import { getLanguagePreference, setLanguagePreference } from '../db/settings-repo';
import {
  DEFAULT_LANGUAGE_PREFERENCE,
  getTranslations,
  I18nContext,
  resolveLanguage,
  type LanguagePreference,
} from './index';

export default function I18nProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [preference, setPreferenceState] = useState<LanguagePreference>(
    DEFAULT_LANGUAGE_PREFERENCE,
  );

  useEffect(() => {
    void (async () => {
      const db = await getDb();
      setPreferenceState(await getLanguagePreference(db));
    })();
  }, []);

  const setPreference = (next: LanguagePreference): void => {
    setPreferenceState(next);
    void (async () => {
      const db = await getDb();
      await setLanguagePreference(db, next);
    })();
  };

  const language = resolveLanguage(preference);
  const strings = useMemo(() => getTranslations(language), [language]);

  return (
    <I18nContext.Provider value={{ language, preference, strings, setPreference }}>
      {children}
    </I18nContext.Provider>
  );
}
