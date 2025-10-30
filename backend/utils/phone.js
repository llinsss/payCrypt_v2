export const phoneArray = (input) => {
  const phone = String(input).trim();
  const match = phone.match(/^(\+\d{1,3})(\d+)$/);
  if (!match) return null;
  return [match[1], match[2]];
};
