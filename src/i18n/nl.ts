import { Translation } from '../i18n';

export const dutch: Translation = {
  chooseYourLanguage: 'Taal',
  languageName: 'Nederlands',
  chooseYourVoice: 'Stem',
  noVoiceAvailable: 'Jouw systeem heeft geen stem voor deze taal.',
  answerIsCorrect: ['Heel goed!', 'Goed gedaan!', 'Perfect!'],
  incorrectAnswer: [(got: string, expected: string) => `Je schreef ${got}, maar het juiste antwoord is ${expected}`],
};
