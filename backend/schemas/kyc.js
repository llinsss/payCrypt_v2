import Joi from "joi";

export const kycSchema = Joi.object({
  type: Joi.any().allow("", null),
  number: Joi.any().allow("", null),
  front_image: Joi.any().allow("", null),
  back_image: Joi.any().allow("", null),
  content: Joi.any().allow("", null),
});
