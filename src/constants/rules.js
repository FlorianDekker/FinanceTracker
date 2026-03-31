// Auto-categorization rules for ABN AMRO imports
// Ported verbatim from ImportTransactions.js
// Rules are checked top-to-bottom; first match wins.

export const RULES = [
  // Woning
  { kw: ['huur', 'hypotheek', 'universiteit van amsterdam', 'uva huur'], cat: 'woning',              sub: 'huur' },
  { kw: ['vattenfall', 'eneco', 'nuon', 'essent', 'greenchoice', 'energie'], cat: 'woning',          sub: 'energie' },
  { kw: ['afvalstoffenheffing'],                                         cat: 'woning',               sub: 'afvalstoffenheffing' },
  { kw: ['waterschapbelasting', 'waterschap'],                          cat: 'woning',               sub: 'waterschapbelasting' },
  // Abonnementen
  { kw: ['spotify'],                                                     cat: 'abonnementen',         sub: 'spotify' },
  { kw: ['basic-fit', 'basicfit', 'basic fit', 'sportschool', 'fitness'], cat: 'abonnementen',       sub: 'sportabonnement' },
  { kw: ['t-mobile', 'kpn', 'vodafone', 'tele2', 'odido', 'simpel'],  cat: 'abonnementen',         sub: 'telefoonabonnement' },
  { kw: ['zorgverzekering', 'zilveren kruis', 'vgz', 'menzis', 'achmea'], cat: 'abonnementen',      sub: 'zorgverzekering' },
  { kw: ['aansprakelijkheids'],                                         cat: 'abonnementen',         sub: 'aansprakelijkheidsverzekering' },
  // Boodschappen
  { kw: ['albert heijn', 'ah to go', 'jumbo', 'lidl', 'aldi', 'vomar', 'plus supermarkt', 'boons', 'spar', 'dirk', 'hoogvliet'], cat: 'boodschappen', sub: 'supermarkt' },
  { kw: ['thuisbezorgd', 'uber eats', 'deliveroo', 'mcdonalds', 'subway', 'burger king', 'dominos', 'bakker', 'umcu'], cat: 'boodschappen', sub: 'eten_onderweg' },
  // Gezondheid
  { kw: ['kruidvat', 'etos', 'apotheek', 'da drogist', 'rituals', 'drogist'], cat: 'gezondheid_verzorging', sub: '' },
  { kw: ['kapper', 'haircut'],                                          cat: 'gezondheid_verzorging', sub: 'kapper' },
  { kw: ['wasserette', 'laundry'],                                      cat: 'gezondheid_verzorging', sub: 'wasserette' },
  // Reiskosten
  { kw: ['ns reizen', 'ns ', 'ov-chipkaart', 'ov chipkaart', 'gvb', 'ret', 'htm', 'arriva', 'connexxion', 'parkeer', 'anwb'], cat: 'reiskosten', sub: '' },
  // Kleding
  { kw: ['uniqlo', 'zara', 'h&m', 'primark', 'wehkamp', 'zalando', 'cos ', 'monki', 'weekday'], cat: 'kleding', sub: '' },
  // Vakantie
  { kw: ['booking', 'airbnb', 'hotels.com', 'ryanair', 'easyjet', 'klm', 'transavia', 'corendon', 'tui', 'sunweb'], cat: 'vakantie', sub: '' },
  // Afspreken vrienden / possibly Sterre
  { kw: ['cafe ', 'café', 'bar ', 'brouwerij', 'pub ', 'restaurant', 'eetcafe', 'eetcafé', 'brasserie', 'bistro', 'eten'], cat: 'afspreken_vrienden', sub: 'uiteten_afhalen', possiblySterre: true },
  { kw: ['cinema', 'bioscoop', 'pathe', 'pathé', 'vue ', 'museum', 'theater', 'concert'],                               cat: 'afspreken_vrienden', sub: '',              possiblySterre: true },
  // Cadeau's
  { kw: ['bol.com', 'coolblue', 'mediamarkt', 'hema', 'action ', 'blokker', 'xenos'], cat: 'cadeaus_overig', sub: '' },
  // Hobby / interieur
  { kw: ['ikea', 'kwantum', 'praxis', 'gamma', 'hornbach', 'karwei'],  cat: 'hobbys',               sub: 'interieur' },
  { kw: ['steam', 'playstation', 'xbox', 'nintendo'],                  cat: 'hobbys',               sub: 'gamen' },
  // Belasting
  { kw: ['belastingdienst', 'belasting', 'cjib'],                      cat: 'overige_kosten',       sub: 'belasting' },
  // Voorschot
  { kw: ['paypal'], cat: 'voorschot', sub: '' },
  // Bankoverschrijving / sparen
  { kw: ['spaarrekening', 'sparen', 'oranje spaar', 'duo hoofdrekening', 'direct savings'], cat: 'bankoverschrijving', sub: '' },
  { kw: ['revolut'], cat: 'bankoverschrijving', sub: '', needsManual: true },
]
