import { apiPost } from './api';

export const sendChat = async ({
  message,
  language = 'en',
  conversationId = null,
  history = null,
  latitude = null,
  longitude = null,
}) => {
  const res = await apiPost('/api/chat', {
    message,
    language,
    conversation_id: conversationId,
    history,
    latitude,
    longitude,
  });
  return res;
};

export const APP_LANGUAGES = ['en', 'hi', 'mr', 'te', 'ta', 'kn'];

export const getSupportedLanguages = () => APP_LANGUAGES;

export const getSpeechLang = (lang) => {
  switch (lang) {
    case 'hi':
      return 'hi-IN';
    case 'mr':
      return 'mr-IN';
    case 'te':
      return 'te-IN';
    case 'ta':
      return 'ta-IN';
    case 'kn':
      return 'kn-IN';
    case 'en':
    default:
      return 'en-US';
  }
};
