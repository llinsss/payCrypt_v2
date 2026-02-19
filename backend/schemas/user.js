import Joi from "joi";

/**
 * Schema for editing the authenticated user's profile.
 * Email and password changes are handled via dedicated endpoints,
 * so they are intentionally excluded here.
 */
export const editProfileSchema = Joi.object({
    tag: Joi.string()
        .min(3)
        .max(50)
        .pattern(/^[a-zA-Z0-9_]+$/)
        .optional()
        .messages({
            "string.min": "Tag must be at least 3 characters long",
            "string.max": "Tag must be at most 50 characters long",
            "string.pattern.base": "Tag may only contain letters, numbers, and underscores",
        }),

    phone: Joi.string()
        .pattern(/^[+]?[(]?[0-9]{3}[)]?[-\s.]?[0-9]{3}[-\s.]?[0-9]{4,6}$/)
        .allow("", null)
        .optional()
        .messages({
            "string.pattern.base": "Please provide a valid phone number",
        }),

    avatar_url: Joi.string().uri().allow("", null).optional().messages({
        "string.uri": "Avatar URL must be a valid URL",
    }),

    full_name: Joi.string().min(2).max(200).allow("", null).optional(),
})
    .min(1)
    .messages({
        "object.min": "At least one field must be provided to update your profile",
    });
