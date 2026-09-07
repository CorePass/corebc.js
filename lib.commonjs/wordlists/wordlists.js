'use strict';

var langCz = require('./lang-cz.js');
var langEn = require('./lang-en.js');
var langEs = require('./lang-es.js');
var langFr = require('./lang-fr.js');
var langJa = require('./lang-ja.js');
var langKo = require('./lang-ko.js');
var langIt = require('./lang-it.js');
var langPt = require('./lang-pt.js');
var langZh = require('./lang-zh.js');

/**
 *  The available Wordlists by their
 *  [ISO 639-1 Language Code](link-wiki-iso639).
 *
 *  (**i.e.** [cz](LangCz), [en](LangEn), [es](LangEs), [fr](LangFr),
 *  [ja](LangJa), [ko](LangKo), [it](LangIt), [pt](LangPt),
 *  [zh_cn](LangZh), [zh_tw](LangZh))
 *
 *  The dist files (in the ``/dist`` folder) have had all languages
 *  except English stripped out, which reduces the library size by
 *  about 80kb. If required, they are available by importing the
 *  included ``wordlists-extra.min.js`` file.
 */
const wordlists = {
    cz: langCz.LangCz.wordlist(),
    en: langEn.LangEn.wordlist(),
    es: langEs.LangEs.wordlist(),
    fr: langFr.LangFr.wordlist(),
    it: langIt.LangIt.wordlist(),
    pt: langPt.LangPt.wordlist(),
    ja: langJa.LangJa.wordlist(),
    ko: langKo.LangKo.wordlist(),
    zh_cn: langZh.LangZh.wordlist("cn"),
    zh_tw: langZh.LangZh.wordlist("tw"),
};

exports.wordlists = wordlists;
//# sourceMappingURL=wordlists.js.map
