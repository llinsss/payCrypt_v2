import { DateTime } from "luxon";

export const generateRequestId = (length = 8) => {
  const now = DateTime.now().setZone("Africa/Lagos");
  const datePart = now.toFormat("yyyyLLddHHmm");

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let randomPart = "";
  for (let i = 0; i < length; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return "req_" + datePart + "_" + randomPart;
};
