import KeyVaultService from "../services/KeyVaultService.js";

const ALLOWED_FIELDS = new Set(["secret", "additionalSigningKeys"]);

export const registerSigningKeys = async (req, res) => {
  try {
    const body = req.body || {};
    const unexpectedFields = Object.keys(body).filter(
      (field) => !ALLOWED_FIELDS.has(field),
    );

    if (unexpectedFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Unexpected field(s): ${unexpectedFields.join(", ")}`,
      });
    }

    await KeyVaultService.storeUserSecrets(req.user.id, {
      secret: body.secret,
      additionalSigningKeys: body.additionalSigningKeys || [],
    });

    return res.status(201).json({
      success: true,
      message: "Signing keys stored securely",
    });
  } catch (error) {
    const statusCode = error.statusCode || 400;

    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
};
