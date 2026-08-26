/**
 * Canonical password policy definition.
 * Ensures API, UI, documentation, and tests all reference the same rules.
 */

const POLICY = {
  MIN_LENGTH: 8,
  MAX_LENGTH: 128,
  SPECIAL_CHARS: "@$!%*?&#",
  REQUIRED_RULES: [
    { name: "lowercase", pattern: /[a-z]/, code: "PASSWORD_MISSING_LOWERCASE" },
    { name: "uppercase", pattern: /[A-Z]/, code: "PASSWORD_MISSING_UPPERCASE" },
    { name: "digit", pattern: /\d/, code: "PASSWORD_MISSING_DIGIT" },
    { name: "special", pattern: new RegExp(`[${POLICY.SPECIAL_CHARS}]`), code: "PASSWORD_MISSING_SPECIAL" },
  ],
};

POLICY.ALLOWED_CHARS_REGEX = new RegExp(`^[A-Za-z\\d${POLICY.SPECIAL_CHARS.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}]+$`);

POLICY.FULL_REGEX = new RegExp(
  `^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[${POLICY.SPECIAL_CHARS.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}])[A-Za-z\\d${POLICY.SPECIAL_CHARS.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}]{${POLICY.MIN_LENGTH},${POLICY.MAX_LENGTH}}$`
);

POLICY.DESCRIPTION = [
  `Minimum ${POLICY.MIN_LENGTH} characters, maximum ${POLICY.MAX_LENGTH} characters`,
  "At least one lowercase letter (a-z)",
  "At least one uppercase letter (A-Z)",
  "At least one digit (0-9)",
  `At least one special character: ${POLICY.SPECIAL_CHARS.split("").join(", ")}`,
].join("; ");

/**
 * Validate password and return validation result with specific rule violation codes.
 * @param {string} password - Password to validate
 * @returns {{isValid: boolean, code?: string, message?: string}}
 *   If invalid, code indicates which rule failed (PASSWORD_TOO_SHORT, PASSWORD_MISSING_UPPERCASE, etc.)
 *   Never echoes back the password value.
 */
export const validatePassword = (password) => {
  if (typeof password !== "string") {
    return { isValid: false, code: "PASSWORD_INVALID_TYPE", message: "Password must be a string" };
  }

  if (password.length < POLICY.MIN_LENGTH) {
    return { isValid: false, code: "PASSWORD_TOO_SHORT", message: `Password must be at least ${POLICY.MIN_LENGTH} characters` };
  }

  if (password.length > POLICY.MAX_LENGTH) {
    return { isValid: false, code: "PASSWORD_TOO_LONG", message: `Password must be at most ${POLICY.MAX_LENGTH} characters` };
  }

  for (const rule of POLICY.REQUIRED_RULES) {
    if (!rule.pattern.test(password)) {
      return { isValid: false, code: rule.code, message: `Password must contain at least one ${rule.name} character` };
    }
  }

  if (!POLICY.ALLOWED_CHARS_REGEX.test(password)) {
    return {
      isValid: false,
      code: "PASSWORD_INVALID_CHARACTERS",
      message: `Password contains invalid characters. Only letters, digits, and these characters are allowed: ${POLICY.SPECIAL_CHARS}`,
    };
  }

  return { isValid: true };
};

export const PASSWORD_POLICY = POLICY;
