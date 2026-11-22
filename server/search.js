// Search that understands Arabic, Kurdish (Sorani) and English spellings of the same thing:
// "ايفون" / "آيفون" / "ئایفۆن" / "iphone" all find the same products.

// Fold letters that people type interchangeably, and Arabic/Persian digits → 0-9.
function normalize(text) {
  return String(text || '')
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
    .trim();
}

// Each group = words that mean the same thing. Written as people type them; normalised below.
const GROUPS = [
  ['iphone', 'ايفون', 'آيفون', 'ئایفۆن', 'اي فون'],
  ['apple', 'ابل', 'أبل', 'ئەپڵ', 'آبل'],
  ['samsung', 'سامسونج', 'سامسونگ', 'سامسۆنگ', 'سامسونك', 'galaxy', 'جالكسي', 'گالاکسی', 'كالكسي', 'كلكسي'],
  ['xiaomi', 'شاومي', 'شاومی', 'شياومي', 'redmi', 'ريدمي', 'ڕێدمی', 'poco', 'بوكو'],
  ['airpods', 'ايربودز', 'ايربود', 'ئێرپۆد', 'ئێرپۆدس', 'earbuds', 'سماعات لاسلكية', 'buds', 'بودز'],
  ['charger', 'شاحن', 'شاحنة', 'شواحن', 'شەحن', 'شحن', 'adapter', 'راس شاحن'],
  ['cable', 'كيبل', 'كابل', 'وايەر', 'وایەر', 'واير', 'سلك', 'type c', 'تايب سي', 'lightning', 'لايتنينغ'],
  ['case', 'cover', 'كفر', 'كفرات', 'كڤر', 'کەڤەر', 'غطاء', 'جراب'],
  ['glass', 'screen protector', 'شاشة حماية', 'شاشه حمايه', 'اسكرين', 'سكرين', 'شاشەی پاراستن', 'لزقة', 'tempered'],
  ['power bank', 'powerbank', 'باور بانك', 'پاوەر بانک', 'باوربانك', 'بطارية متنقلة', 'شاحن متنقل'],
  ['watch', 'smart watch', 'ساعة', 'ساعه', 'ساعة ذكية', 'کاتژمێر', 'واچ', 'واتش'],
  ['headphone', 'headphones', 'هێدفۆن', 'هيدفون', 'سماعة رأس', 'سماعة', 'سماعات'],
  ['phone', 'mobile', 'موبايل', 'مۆبایل', 'هاتف', 'جوال', 'تلفون'],
  ['holder', 'هولدر', 'هۆڵدەر', 'حامل', 'ستاند'],
  ['wireless', 'لاسلكي', 'بێوایەر', 'magsafe', 'ماك سيف', 'ماغ سيف'],
];
const NGROUPS = GROUPS.map((g) => [...new Set(g.map(normalize).filter(Boolean))]);

// Words to try for one typed token: the token itself plus its synonyms (if it belongs to a group).
function expandToken(tok) {
  const out = new Set([tok]);
  for (const g of NGROUPS) {
    if (g.some((w) => w === tok || (tok.length >= 3 && (w.startsWith(tok) || tok.startsWith(w))))) g.forEach((w) => out.add(w));
  }
  return [...out];
}

/** Turn a query into SQL: every word must match (AND); a word matches if any of its synonyms appears (OR). */
function searchClause(query, column = 'p.search_text') {
  const q = normalize(query);
  // Multi-word synonyms first ("power bank", "شاشة حماية"), then single words.
  let rest = ` ${q} `;
  const tokens = [];
  for (const g of NGROUPS) for (const w of g) {
    if (w.includes(' ') && rest.includes(` ${w} `)) { tokens.push(w); rest = rest.replace(` ${w} `, ' '); }
  }
  tokens.push(...rest.split(' ').filter((t) => t.length >= 1));
  if (!tokens.length) return null;
  const parts = []; const params = [];
  for (const t of tokens.slice(0, 6)) {
    const words = expandToken(t);
    parts.push(`(${words.map(() => `${column} LIKE ?`).join(' OR ')})`);
    params.push(...words.map((w) => `%${w}%`));
  }
  return { sql: parts.join(' AND '), params };
}

module.exports = { normalize, searchClause, expandToken };
