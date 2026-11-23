// Search that understands Arabic, Kurdish (Sorani) and English spellings of the same thing, and matches
// whole words: "كفر ١٧ بروماكس" finds only 17 Pro Max cases (not the phone, not screen protectors),
// "سامسونك" finds only Samsung products.

// Model words people glue together ("بروماكس", "promax", "17promax") → separate words.
const COMPOUNDS = [
  [/promax/g, 'pro max'], [/بروماكس/g, 'برو ماكس'], [/برومكس/g, 'برو ماكس'],
  [/proplus/g, 'pro plus'], [/برو بلس/g, 'برو بلس'],
];

// Fold letters that people type interchangeably, Arabic/Persian digits → 0-9, split digits from letters.
function normalize(text) {
  let s = String(text || '')
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, '') // harakat + tatweel
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[أإآٱئءؤ]/g, (c) => (c === 'ؤ' ? 'و' : 'ا'))
    .replace(/[یىيێ]/g, 'ي')
    .replace(/[کك]/g, 'ك')
    .replace(/گ/g, 'ك')
    .replace(/[ەةھه]/g, 'ه')
    .replace(/[ۆۇۉ]/g, 'و')
    .replace(/ڵ/g, 'ل')
    .replace(/ڕ/g, 'ر')
    .replace(/ڤ/g, 'ف')
    .replace(/چ/g, 'ج')
    .replace(/پ/g, 'ب')
    .replace(/ژ/g, 'ز')
    .replace(/ا+/g, 'ا')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(\p{N})(\p{L})/gu, '$1 $2') // "17pro" → "17 pro"
    .replace(/(\p{L})(\p{N})/gu, '$1 $2') // "s24" → "s 24"
    .trim();
  for (const [re, to] of COMPOUNDS) s = s.replace(re, to);
  return s;
}

// Each group = words that mean the same thing (any language). Written as people type them; normalised below.
const GROUPS = [
  ['iphone', 'ايفون', 'آيفون', 'ئایفۆن', 'اي فون', 'ايفوون'],
  ['apple', 'ابل', 'أبل', 'ئەپڵ', 'آبل'],
  ['samsung', 'سامسونج', 'سامسونگ', 'سامسۆنگ', 'سامسونك', 'سامسنج', 'سامسونق', 'galaxy', 'جالكسي', 'گالاکسی', 'كالكسي', 'كلكسي', 'جلاكسي'],
  ['xiaomi', 'شاومي', 'شاومی', 'شياومي', 'redmi', 'ريدمي', 'ڕێدمی', 'poco', 'بوكو'],
  ['honor', 'هونر', 'هونور', 'هۆنەر'],
  ['infinix', 'انفنكس', 'انفينكس', 'ئینفینیکس'],
  ['tecno', 'تكنو', 'تيكنو'],
  ['huawei', 'هواوي', 'هواوی'],
  ['airpods', 'ايربودز', 'ايربود', 'ئێرپۆد', 'ئێرپۆدس', 'earbuds', 'سماعات لاسلكية', 'buds', 'بودز'],
  ['charger', 'شاحن', 'شاحنة', 'شواحن', 'شەحن', 'شحن', 'adapter', 'راس شاحن'],
  ['cable', 'كيبل', 'كابل', 'وايەر', 'وایەر', 'واير', 'وايرات', 'سلك', 'type c', 'تايب سي', 'lightning', 'لايتنينغ'],
  ['case', 'cases', 'cover', 'covers', 'كفر', 'كفرات', 'كڤر', 'کەڤەر', 'غطاء', 'جراب', 'غڵاف', 'بەرگ'],
  ['glass', 'screen protector', 'protector', 'شاشة حماية', 'شاشات حماية', 'اسكرين', 'سكرين', 'شاشەی پاراستن', 'لزقة', 'tempered'],
  ['power bank', 'powerbank', 'باور بانك', 'پاوەر بانک', 'باوربانك', 'بطارية متنقلة', 'شاحن متنقل'],
  ['watch', 'smart watch', 'ساعة', 'ساعه', 'ساعة ذكية', 'کاتژمێر', 'واچ', 'واتش'],
  ['headphone', 'headphones', 'هێدفۆن', 'هيدفون', 'سماعة رأس', 'سماعة', 'سماعات'],
  ['phone', 'mobile', 'موبايل', 'مۆبایل', 'هاتف', 'جوال', 'تلفون'],
  ['holder', 'هولدر', 'هۆڵدەر', 'حامل', 'ستاند'],
  ['wireless', 'لاسلكي', 'بێوایەر', 'magsafe', 'ماك سيف', 'ماغ سيف'],
  // model words, so Arabic/Kurdish queries match English product names and the other way round
  ['pro', 'برو', 'پرۆ'],
  ['max', 'ماكس', 'ماکس'],
  ['plus', 'بلس', 'پلەس', 'پلس'],
  ['ultra', 'الترا', 'ئەلترا', 'التره', 'اولترا'],
  ['mini', 'ميني', 'مینی'],
  ['lite', 'لايت'],
];
const NGROUPS = GROUPS.map((g) => [...new Set(g.map(normalize).filter(Boolean))]);

// Words to try for one typed token: the token itself plus its synonyms (if it belongs to a group).
function expandToken(tok) {
  const out = new Set([tok]);
  for (const g of NGROUPS) {
    if (g.includes(tok) || (tok.length >= 4 && g.some((w) => w.length >= 4 && (w.startsWith(tok) || tok.startsWith(w))))) g.forEach((w) => out.add(w));
  }
  return [...out];
}

// Numbers and very short words must match a whole word ("17" ≠ "170", "pro" ≠ "protector");
// longer words may match the start of a word ("كفر" → "كفرات").
const isLatin = (w) => /^[a-z0-9 ]+$/.test(w);
function wordPattern(w) {
  const exact = /^\d+$/.test(w) || (isLatin(w) ? w.length <= 3 : w.length <= 2);
  return exact ? `% ${w} %` : `% ${w}%`;
}

function tokenize(query) {
  const q = normalize(query);
  let rest = ` ${q} `;
  const tokens = [];
  for (const g of NGROUPS) for (const w of g) {
    if (w.includes(' ') && rest.includes(` ${w} `)) { tokens.push(w); rest = rest.replace(` ${w} `, ' '); }
  }
  tokens.push(...rest.split(' ').filter(Boolean));
  return tokens.slice(0, 8);
}

/** SQL for a query: every word must match (AND); a word matches if any of its synonyms appears as a word (OR). */
function searchClause(query, column = 'p.search_text') {
  const tokens = tokenize(query);
  if (!tokens.length) return null;
  const parts = []; const params = [];
  for (const t of tokens) {
    const words = expandToken(t);
    parts.push(`(${words.map(() => `${column} LIKE ?`).join(' OR ')})`);
    params.push(...words.map(wordPattern));
  }
  return { sql: parts.join(' AND '), params, tokens };
}

// Accessory kinds: if the shopper didn't ask for one, products that are one rank lower
// ("ايفون 17 برو ماكس" → the phone first, its cases after).
const ACCESSORY_GROUPS = ['case', 'glass', 'charger', 'cable', 'power bank', 'holder', 'headphone', 'airpods', 'watch']
  .map((k) => NGROUPS.find((g) => g.includes(k)));
const hasWord = (text, w) => text.includes(wordPattern(w).replace(/%/g, ''));

/** Relevance: words found in the product's own name count more than words found only in brand/category. */
function relevance(product, tokens) {
  const name = ` ${normalize([product.name_ku, product.name_ar, product.name_en].filter(Boolean).join(' '))} `;
  let score = 0;
  for (const t of tokens) if (expandToken(t).some((w) => hasWord(name, w))) score += 2;
  const asked = new Set(tokens.flatMap(expandToken));
  for (const g of ACCESSORY_GROUPS) {
    if (!g.some((w) => asked.has(w)) && g.some((w) => hasWord(name, w))) score -= 3;
  }
  return score;
}

module.exports = { normalize, searchClause, expandToken, relevance, tokenize };
