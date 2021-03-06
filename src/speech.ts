import * as bcp47 from './bcp47';
import * as i18n from './i18n';

type VoiceName = string;

export class VoiceID {
  constructor(public lang: bcp47.Tag, public name: VoiceName) {
    if (lang.includes('/')) {
      throw Error(`Unexpected "/" in the language of the voice: ${lang}`);
    }

    if (name.includes('/')) {
      throw Error(`Unexpected "/" in the name of the voice: ${name}`);
    }
  }

  public toKey(): string {
    return [this.lang, this.name].join('/');
  }
}

export function voiceIDFromKey(key: string): VoiceID {
  const parts = key.split('/');
  if (parts.length !== 2) {
    throw Error(`Invalid voice ID given as key: ${key}`);
  }

  const [lang, name] = parts;
  return new VoiceID(lang, name);
}

export class Voices {
  private byBCP47 = new Map<bcp47.Tag, Map<VoiceName, SpeechSynthesisVoice>>();

  constructor(listOfVoices: Array<SpeechSynthesisVoice>) {
    for (const v of listOfVoices) {
      const lang = v.lang;

      let vv: Map<VoiceName, SpeechSynthesisVoice> | undefined = this.byBCP47.get(lang);

      if (vv === undefined) {
        vv = new Map<VoiceName, SpeechSynthesisVoice>();
        this.byBCP47.set(lang, vv);
      }

      vv.set(v.name, v);
    }

    // Post-conditions
    for (const lang of this.byBCP47.keys()) {
      const vv: Map<VoiceName, SpeechSynthesisVoice> | undefined = this.byBCP47.get(lang);
      if (vv === undefined) {
        throw Error(`Unexpectedly no voices for the language in byBCP47: ${lang}`);
      }

      for (const [name, voice] of vv) {
        if (name !== voice.name) {
          throw Error(`Unexpected voice keyed on ${name} with .name: ${voice.name}`);
        }
      }
    }
  }

  public ids(): Array<VoiceID> {
    const result = new Array<VoiceID>();

    for (const [lang, byName] of this.byBCP47.entries()) {
      for (const name of byName.keys()) {
        result.push(new VoiceID(lang, name));
      }
    }

    return result;
  }

  public has(id: VoiceID): boolean {
    const v = this.byBCP47.get(id.lang)?.has(id.name);
    return v !== undefined && v !== null && v;
  }

  public get(id: VoiceID): SpeechSynthesisVoice {
    const byName = this.byBCP47.get(id.lang);
    if (byName === undefined) {
      throw Error(`The ID is missing in the Voices: ${JSON.stringify(id)}`);
    }

    const voice = byName.get(id.name);
    if (voice === undefined) {
      throw Error(`The ID is missing in the Voices: ${JSON.stringify(id)}`);
    }

    return voice;
  }

  public filterByExactLanguage(lang: bcp47.Tag): Array<VoiceID> {
    const result = new Array<VoiceID>();

    const byName = this.byBCP47.get(lang);
    if (byName === undefined) {
      return result;
    }

    for (const name of byName.keys()) {
      result.push(new VoiceID(lang, name));
    }

    return result;
  }

  public filterByPrimaryLanguage(primaryLanguage: string): Array<VoiceID> {
    const result = new Array<VoiceID>();

    for (const [lang, byName] of this.byBCP47) {
      if (bcp47.primaryLanguage(lang) === primaryLanguage) {
        for (const name of byName.keys()) {
          result.push(new VoiceID(lang, name));
        }
      }
    }
    return result;
  }
}

export function compareByName(a: VoiceID, b: VoiceID) {
  if (a.name === b.name) {
    if (a.lang === b.lang) {
      return 0;
    } else if (a.lang < b.lang) {
      return -1;
    } else {
      return 1;
    }
  } else if (a.name < b.name) {
    return -1;
  } else {
    return 1;
  }
}

export type VoicesByLanguage = Map<i18n.LanguageID, Array<VoiceID>>;

export function groupVoicesByLanguage(voices: Voices, i18nLangs: IterableIterator<i18n.LanguageID>): VoicesByLanguage {
  const r = new Map<i18n.LanguageID, Array<VoiceID>>();

  for (const i18nLang of i18nLangs) {
    const langVoices = new Array<VoiceID>();

    // If there is the exact match between the language specifications, accept all the voices.
    const exactMatches = voices.filterByExactLanguage(i18nLang);

    if (exactMatches.length > 0) {
      langVoices.push(...exactMatches);
    } else {
      // We need to filter by the primary language and accept those voices as a fallback.
      const fallbackMatches = voices.filterByPrimaryLanguage(bcp47.primaryLanguage(i18nLang));
      langVoices.push(...fallbackMatches);
    }

    r.set(i18nLang, langVoices);
  }

  const sorted = new Map<i18n.LanguageID, Array<VoiceID>>();
  for (const [i18nLang, langsNames] of r.entries()) {
    sorted.set(i18nLang, langsNames.sort(compareByName));
  }
  return sorted;
}

export function voiceForLanguageOK(
  voice: VoiceID,
  language: i18n.LanguageID,
  voicesByLanguage: VoicesByLanguage,
): boolean {
  const maybeList: Array<VoiceID> | undefined = voicesByLanguage.get(language);
  if (maybeList !== undefined) {
    let found = false;
    const key = voice.toKey();

    for (const anotherVoice of maybeList) {
      if (anotherVoice.toKey() === key) {
        found = true;
        break;
      }
    }

    return found;
  } else {
    return false;
  }
}

/**
 * Promise that the system speech synthesis will be ready.
 *
 * Remark (Marko Ristin, 2020-04-28): Since the voices might change *while* the application is running,
 * voices should be integrated in the application state. This is left to a future version as it is hardly a real
 * issue at the moment.
 */
export function promiseReady(): Promise<void> {
  // This is necessary since Chrome needs to load the voices, while other browsers just return the getVoices.
  speechSynthesis.onvoiceschanged = () => {
    /* do nothing */
  };

  return new Promise<void>((resolve, _) => {
    let retries = 0;

    const intervalID = setInterval(() => {
      if (speechSynthesis.getVoices().length > 0) {
        clearInterval(intervalID);
        resolve();
      }

      retries++;

      if (retries >= 10) {
        clearInterval(intervalID);
        resolve();
      }
    }, 500);
  });
}
