// Supported currencies for meal pricing. Code -> { symbol, name }.
const CURRENCIES = {
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  JPY: { symbol: '¥', name: 'Japanese Yen' },
  CAD: { symbol: 'CA$', name: 'Canadian Dollar' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
  INR: { symbol: '₹', name: 'Indian Rupee' },
  CNY: { symbol: '¥', name: 'Chinese Yuan' },
  KRW: { symbol: '₩', name: 'South Korean Won' },
  MXN: { symbol: 'MX$', name: 'Mexican Peso' },
  BRL: { symbol: 'R$', name: 'Brazilian Real' },
  CHF: { symbol: 'CHF', name: 'Swiss Franc' },
  SEK: { symbol: 'kr', name: 'Swedish Krona' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar' }
};

function symbolFor(code) {
  const c = CURRENCIES[String(code || '').toUpperCase()];
  return c ? c.symbol : '$';
}

module.exports = { CURRENCIES, symbolFor };
