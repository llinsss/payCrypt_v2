export const RATE_LIMIT_TIERS = {
  FREE: "FREE",
  PREMIUM: "PREMIUM",
  ENTERPRISE: "ENTERPRISE",
};

export const TIER_LIMITS = {
  [RATE_LIMIT_TIERS.FREE]: {
    login: 5,         // /15min
    transactions: 100, // /hour
    api: 1000,        // /hour
  },
  [RATE_LIMIT_TIERS.PREMIUM]: {
    login: 20,
    transactions: 1000,
    api: 5000,
  },
  [RATE_LIMIT_TIERS.ENTERPRISE]: {
    login: 100,
    transactions: 10000,
    api: 50000,
  },
};

export default {
  RATE_LIMIT_TIERS,
  TIER_LIMITS,
};
