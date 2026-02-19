import Joi from "joi";

/**
 * Schema for creating a new KYC submission.
 * All identity fields are required on initial submission.
 */
export const kycCreateSchema = Joi.object({
    first_name: Joi.string()
        .min(2)
        .max(100)
        .required()
        .messages({
            "string.min": "First name must be at least 2 characters",
            "string.max": "First name must be at most 100 characters",
            "any.required": "First name is required",
            "string.empty": "First name cannot be empty",
        }),

    last_name: Joi.string()
        .min(2)
        .max(100)
        .required()
        .messages({
            "string.min": "Last name must be at least 2 characters",
            "string.max": "Last name must be at most 100 characters",
            "any.required": "Last name is required",
            "string.empty": "Last name cannot be empty",
        }),

    dob: Joi.string()
        .isoDate()
        .required()
        .messages({
            "string.isoDate": "Date of birth must be a valid ISO 8601 date (YYYY-MM-DD)",
            "any.required": "Date of birth is required",
            "string.empty": "Date of birth cannot be empty",
        }),

    country: Joi.string()
        .min(2)
        .max(100)
        .required()
        .messages({
            "string.min": "Country must be at least 2 characters",
            "any.required": "Country is required",
            "string.empty": "Country cannot be empty",
        }),

    id_type: Joi.string()
        .valid("passport", "national_id", "drivers_license", "residence_permit")
        .required()
        .messages({
            "any.only": "ID type must be one of: passport, national_id, drivers_license, residence_permit",
            "any.required": "ID type is required",
            "string.empty": "ID type cannot be empty",
        }),

    id_number: Joi.string()
        .min(3)
        .max(50)
        .required()
        .messages({
            "string.min": "ID number must be at least 3 characters",
            "string.max": "ID number must be at most 50 characters",
            "any.required": "ID number is required",
            "string.empty": "ID number cannot be empty",
        }),

    id_image_url: Joi.string().uri().allow("", null).optional().messages({
        "string.uri": "ID image URL must be a valid URL",
    }),

    selfie_url: Joi.string().uri().allow("", null).optional().messages({
        "string.uri": "Selfie URL must be a valid URL",
    }),
});

/**
 * Schema for updating an existing KYC record.
 * All fields are optional (partial update); at least one must be provided.
 */
export const kycUpdateSchema = Joi.object({
    first_name: Joi.string().min(2).max(100).optional().messages({
        "string.min": "First name must be at least 2 characters",
        "string.max": "First name must be at most 100 characters",
    }),

    last_name: Joi.string().min(2).max(100).optional().messages({
        "string.min": "Last name must be at least 2 characters",
        "string.max": "Last name must be at most 100 characters",
    }),

    dob: Joi.string().isoDate().optional().messages({
        "string.isoDate": "Date of birth must be a valid ISO 8601 date (YYYY-MM-DD)",
    }),

    country: Joi.string().min(2).max(100).optional(),

    id_type: Joi.string()
        .valid("passport", "national_id", "drivers_license", "residence_permit")
        .optional()
        .messages({
            "any.only": "ID type must be one of: passport, national_id, drivers_license, residence_permit",
        }),

    id_number: Joi.string().min(3).max(50).optional(),

    id_image_url: Joi.string().uri().allow("", null).optional().messages({
        "string.uri": "ID image URL must be a valid URL",
    }),

    selfie_url: Joi.string().uri().allow("", null).optional().messages({
        "string.uri": "Selfie URL must be a valid URL",
    }),
})
    .min(1)
    .messages({
        "object.min": "At least one field must be provided for update",
    });
