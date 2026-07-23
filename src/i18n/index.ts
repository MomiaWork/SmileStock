import * as Localization from 'expo-localization';
import { createContext, useContext } from 'react';

import { en, zh, type Translations } from './translations';

export type SupportedLanguage = 'zh' | 'en';
export type LanguagePreference = 'system' | SupportedLanguage;

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['zh', 'en'];
export const DEFAULT_LANGUAGE_PREFERENCE: LanguagePreference = 'system';

const TRANSLATIONS: Record<SupportedLanguage, Translations> = { zh, en };

/** 系統語系代碼（如 "zh-Hant-TW"、"ja-JP"）對應到支援語言，對不到就交給呼叫端 fallback 英文——
 * 目前只做中/英，其他語系（含日文）先一律 fallback 英文，之後真的要支援日文再擴充 */
function localeToSupportedLanguage(languageCode: string | null): SupportedLanguage | undefined {
  if (languageCode === null) return undefined;
  const code = languageCode.toLowerCase();
  if (code.startsWith('zh')) return 'zh';
  if (code.startsWith('en')) return 'en';
  return undefined;
}

/** preference 為 'system' 時嘗試用系統語系，對不到支援清單就 fallback 英文；否則直接用使用者指定的語言 */
export function resolveLanguage(preference: LanguagePreference): SupportedLanguage {
  if (preference !== 'system') return preference;
  const [firstLocale] = Localization.getLocales();
  return localeToSupportedLanguage(firstLocale?.languageCode ?? null) ?? 'en';
}

export function getTranslations(language: SupportedLanguage): Translations {
  return TRANSLATIONS[language];
}

export interface I18nContextValue {
  language: SupportedLanguage;
  preference: LanguagePreference;
  strings: Translations;
  setPreference: (preference: LanguagePreference) => void;
}

export const I18nContext = createContext<I18nContextValue | undefined>(undefined);

/** 螢幕元件用這個拿目前語言的字串表（strings）跟切換語言的方法，Context 找不到就是忘了包 I18nProvider */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n 必須在 I18nProvider 底下使用');
  }
  return ctx;
}

export type { Translations } from './translations';
