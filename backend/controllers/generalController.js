import upload from "../services/external/cloudinary.js";
import { failure, success } from "../utils/response.js";
import * as vtu from "../services/external/vtu.js";
import redis from "../config/redis.js";
import * as contract from "../contracts/index.js";
import { ethers } from "ethers";

const CACHE_TTL_LONG = 60 * 24 * 30;
const CACHE_TTL_SHORT = 60 * 24;

const getCacheKey = (prefix, payload) =>
  `${prefix}:${Buffer.from(JSON.stringify(payload)).toString("base64")}`;

export const upload_file = async (req, res, next) => {
  try {
    if (!req.file) {
      return failure(res, "No file found", null, 422);
    }
    const data = await upload(req.file);
    if (data?.secure_url) {
      return success(res, "successful", data.secure_url, 200);
    }
    return failure(res, "Failed to upload file", null, 400);
  } catch (err) {
    next(err);
  }
};

export const register_tag = async (req, res, next) => {
  try {
    const { chain, tag } = req.body;
    const data = await contract.register(chain, tag);
    return success(res, "successful", data, 200);
  } catch (err) {
    next(err);
  }
};

export const get_tag_address = async (req, res, next) => {
  try {
    const { chain, tag } = req.body;
    const data = await contract.tag_address(chain, tag);
    return success(res, "successful", { address: data }, 200);
  } catch (err) {
    next(err);
  }
};

export const send_to_tag = async (req, res, next) => {
  try {
    const { chain, sender_tag, receiver_tag, amount } = req.body;
    const data = await contract.send_via_tag({
      chain,
      sender_tag,
      receiver_tag,
      amount,
    });
    return success(res, "successful", { hash: data }, 200);
  } catch (err) {
    next(err);
  }
};

export const send_to_wallet = async (req, res, next) => {
  try {
    const { chain, sender_tag, receiver_address, amount } = req.body;
    const data = await contract.send_via_wallet({
      chain,
      sender_tag,
      receiver_address,
      amount,
    });
    return success(res, "successful", { hash: data }, 200);
  } catch (err) {
    next(err);
  }
};

export const get_tag_balance = async (req, res, next) => {
  try {
    const { chain, tag } = req.body;
    const data = await contract.tag_balance(chain, tag);
    return success(res, "successful", { balance: data }, 200);
  } catch (err) {
    next(err);
  }
};

export const bill_balance = async (req, res, next) => {
  try {
    const data = await vtu.balance();
    if (data.success) {
      return success(res, "successful", data.data, 200);
    }
    return failure(res, "Failed", null, 400);
  } catch (err) {
    next(err);
  }
};

export const bill_data_variations = async (req, res, next) => {
  try {
    const { service } = req.query;
    let cacheKey = "vtu:data_variations";
    if (service) {
      cacheKey = `${cacheKey}:${service}`;
    }
    const cached = await redis.get(cacheKey);

    if (cached) {
      return success(res, "successful", JSON.parse(cached), 200);
    }
    const svc = service?.trim().toLowerCase();
    const data = await vtu.data_variations(svc);
    if (data.success) {
      await redis.setEx(cacheKey, CACHE_TTL_SHORT, JSON.stringify(data.data));
      return success(res, "successful", data.data, 200);
    }
    return failure(res, "Failed", null, 400);
  } catch (err) {
    next(err);
  }
};

export const bill_tv_variations = async (req, res, next) => {
  try {
    const { service } = req.query;
    let cacheKey = "vtu:tv_variations";
    if (service) {
      cacheKey = `${cacheKey}:${service}`;
    }
    const cached = await redis.get(cacheKey);

    if (cached) {
      return success(res, "successful", JSON.parse(cached), 200);
    }
    const svc = service?.trim().toLowerCase();
    const data = await vtu.tv_variations(svc);
    if (data.success) {
      await redis.setEx(cacheKey, CACHE_TTL_SHORT, JSON.stringify(data.data));
      return success(res, "successful", data.data, 200);
    }
    return failure(res, "Failed", null, 400);
  } catch (err) {
    next(err);
  }
};

export const bill_data_services = async (req, res, next) => {
  try {
    const cacheKey = "vtu:data_services";
    const cached = await redis.get(cacheKey);

    if (cached) {
      return success(res, "successful", JSON.parse(cached), 200);
    }
    const data = await vtu.airtime_and_data_services();
    if (data.success) {
      await redis.setEx(cacheKey, CACHE_TTL_SHORT, JSON.stringify(data.data));
      return success(res, "successful", data.data, 200);
    }
    return failure(res, "Failed", null, 400);
  } catch (err) {
    next(err);
  }
};

export const bill_airtime_services = async (req, res, next) => {
  try {
    const cacheKey = "vtu:airtime_services";
    const cached = await redis.get(cacheKey);

    if (cached) {
      return success(res, "successful", JSON.parse(cached), 200);
    }
    const data = await vtu.airtime_and_data_services();
    if (data.success) {
      await redis.setEx(cacheKey, CACHE_TTL_SHORT, JSON.stringify(data.data));
      return success(res, "successful", data.data, 200);
    }
    return failure(res, "Failed", null, 400);
  } catch (err) {
    next(err);
  }
};

export const bill_electricity_services = async (req, res, next) => {
  try {
    const cacheKey = "vtu:electricity_services";
    const cached = await redis.get(cacheKey);

    if (cached) {
      return success(res, "successful", JSON.parse(cached), 200);
    }
    const data = await vtu.electricity_services();
    if (data.success) {
      await redis.setEx(cacheKey, CACHE_TTL_SHORT, JSON.stringify(data.data));
      return success(res, "successful", data.data, 200);
    }
    return failure(res, "Failed", null, 400);
  } catch (err) {
    next(err);
  }
};

export const bill_betting_services = async (req, res, next) => {
  try {
    const cacheKey = "vtu:betting_services";
    const cached = await redis.get(cacheKey);

    if (cached) {
      return success(res, "successful", JSON.parse(cached), 200);
    }
    const data = await vtu.betting_services();
    if (data.success) {
      await redis.setEx(cacheKey, CACHE_TTL_SHORT, JSON.stringify(data.data));
      return success(res, "successful", data.data, 200);
    }
    return failure(res, "Failed", null, 400);
  } catch (err) {
    next(err);
  }
};

export const bill_tv_services = async (req, res, next) => {
  try {
    const cacheKey = "vtu:tv_services";
    const cached = await redis.get(cacheKey);

    if (cached) {
      return success(res, "successful", JSON.parse(cached), 200);
    }
    const data = await vtu.tv_services();
    if (data.success) {
      await redis.setEx(cacheKey, CACHE_TTL_SHORT, JSON.stringify(data.data));
      return success(res, "successful", data.data, 200);
    }
    return failure(res, "Failed", null, 400);
  } catch (err) {
    next(err);
  }
};

export const bill_requery = async (req, res, next) => {
  try {
    const { request_id } = req.body;
    if (!request_id) {
      return failure(res, "Invalid Request ID", [], 422);
    }
    const data = await vtu.requery(request_id);
    if (data.success) {
      return success(res, "successful", data.data, 200);
    }
    return failure(res, "Failed", [], 400);
  } catch (err) {
    next(err);
  }
};

export const bill_verify_customer = async (req, res, next) => {
  try {
    const { service_id, customer_id, variation_id } = req.body;
    const payload = { service_id, customer_id, variation_id };

    const cacheKey = getCacheKey("vtu:verify_biller", payload);
    const cached = await redis.get(cacheKey);
    if (cached) return success(res, "successful", JSON.parse(cached), 200);

    const apiData = await vtu.verify({
      service_id,
      customer_id,
      ...(variation_id && { variation_id }),
    });

    if (apiData.success) {
      await redis.setEx(cacheKey, CACHE_TTL_LONG, JSON.stringify(apiData.data));
      return success(res, "successful", apiData.data, 200);
    }

    return failure(res, "Failed", null, 400);
  } catch (err) {
    next(err);
  }
};
