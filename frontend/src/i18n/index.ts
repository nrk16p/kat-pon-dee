import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import th from './th.json'
import en from './en.json'

/** Thai is the default and the source of truth — this app is for Thai growers.
 *  English exists for buyers, agronomists and export paperwork. */
void i18n.use(initReactI18next).init({
  resources: { th: { translation: th }, en: { translation: en } },
  lng: localStorage.getItem('locale') ?? 'th',
  fallbackLng: 'th',
  interpolation: { escapeValue: false },
})

export default i18n
