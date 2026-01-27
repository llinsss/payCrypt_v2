import redis from "../../config/redis.js";
import { createApiClient } from "../../utils/api.js";
import axios from "axios";

export const getVTUToken = async () => {
  try {
    const cached = await redis.get("vtu:token");
    if (cached) {
      return cached;
    }
    const new_cache = await setVTUToken();
    return new_cache;
  } catch (err) {
    console.error("⚠️ VTU TOKEN ERROR:", err?.response?.data || err.message);
    await redis.del("vtu:token");
    return null;
  }
};

export const setVTUToken = async () => {
  try {
    const { data } = await axios.post(
      `${process.env.VTU_API_URL}/jwt-auth/v1/token`,
      {
        username: process.env.VTU_USERNAME,
        password: process.env.VTU_PASSWORD,
      }
    );

    if (data?.token) {
      await redis.set("vtu:token", data.token, {
        EX: 24 * 60 * 60,
      });

      console.log("🔐 New VTU token fetched and cached for 24h.");
      return data.token;
    }

    console.error("❌ VTU API returned no token.");
    return null;
  } catch (err) {
    console.error("⚠️ VTU TOKEN ERROR:", err?.response?.data || err.message);
    await redis.del("vtu:token");
    return null;
  }
};

let vtuClient = null;
const getVtuClient = async () => {
  if (vtuClient) return vtuClient;
  const token = await getVTUToken();
  if (token) {
    vtuClient = createApiClient(process.env.VTU_API_URL, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }
  return vtuClient;
};
export const vtu = {
  async get(url, config) {
    const client = await getVtuClient();
    return client ? client.get(url, config) : null;
  },
  async post(url, data, config) {
    const client = await getVtuClient();
    return client ? client.post(url, data, config) : null;
  },
  // Add other methods as needed
};
