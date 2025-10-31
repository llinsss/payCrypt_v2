import dayjs from "dayjs";

export const toDDMMYYYY = (input) => {
  const date = dayjs(input);
  if (!date.isValid()) return null;
  return date.format("DD-MM-YYYY");
};