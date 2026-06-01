const SUPPORTED_COUNTRIES = [
  { code: 'PH', name: 'Philippines' },
  { code: 'JP', name: 'Japan' },
  { code: 'TH', name: 'Thailand' },
  { code: 'MM', name: 'Myanmar' },
  { code: 'IN', name: 'India' },
  { code: 'BD', name: 'Bangladesh' },
  { code: 'MY', name: 'Malaysia' },
];
const SUPPORTED_CODES = SUPPORTED_COUNTRIES.map(c => c.code);
function isSupportedCountry(code) { return SUPPORTED_CODES.includes(code); }
module.exports = { SUPPORTED_COUNTRIES, SUPPORTED_CODES, isSupportedCountry };
