function computeBalance({ hireYear, currentYear, used, adjustments }) {
  const grantsEarned = (currentYear - hireYear + 1) * 10;
  return { grantsEarned, used, adjustments, balance: grantsEarned - used + adjustments };
}

module.exports = { computeBalance };
