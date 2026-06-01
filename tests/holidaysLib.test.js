const { SUPPORTED_COUNTRIES, SUPPORTED_CODES, isSupportedCountry } = require('../lib/holidays');

describe('lib/holidays', () => {
  test('exposes the 7 supported countries with codes and names', () => {
    expect(SUPPORTED_CODES).toEqual(['PH','JP','TH','MM','IN','BD','MY']);
    expect(SUPPORTED_COUNTRIES.find(c => c.code === 'MM').name).toBe('Myanmar');
  });
  test('isSupportedCountry validates membership', () => {
    expect(isSupportedCountry('PH')).toBe(true);
    expect(isSupportedCountry('US')).toBe(false);
    expect(isSupportedCountry('')).toBe(false);
    expect(isSupportedCountry(undefined)).toBe(false);
  });
});
