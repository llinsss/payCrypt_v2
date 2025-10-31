import axios from "axios";
import pino from "pino";

const logger = pino({
  transport: { target: "pino-pretty" },
  level: process.env.LOG_LEVEL || "info",
});

/**
 * Create a reusable API client with custom baseURL
 * @param {string} baseURL
 * @param {object} [extraConfig]
 * @returns {AxiosInstance}
 */
export const createApiClient = (baseURL, extraConfig = {}) => {
  const client = axios.create({
    baseURL,
    timeout: 30000,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...extraConfig,
  });

  // Request logging
  client.interceptors.request.use(
    (config) => {
      logger.info(
        {
          url: config.url,
          method: config.method,
          baseURL: config.baseURL,
          authorization: config.Authorization,
        },
        "Outgoing API request",
      );
      return config;
    },
    (error) => {
      logger.error({ err: error }, "Request setup error");
      return Promise.reject(error);
    },
  );

  // Response logging & unwrapping
  client.interceptors.response.use(
    (response) => {
      logger.info(
        { status: response.status, url: response.config.url },
        "API response received",
      );
      return response.data;
    },
    (error) => {
      if (error.response) {
        logger.error(
          {
            status: error.response.status,
            data: error.response.data,
            url: error.config?.url,
            baseURL: error.config?.baseURL,
          },
          "API error response",
        );
      } else if (error.request) {
        logger.error({ url: error.config?.url }, "No response from API");
      } else {
        logger.error({ err: error }, "Axios setup error");
      }

      return Promise.reject(
        new Error(
          error.response?.data?.message ||
            error.message ||
            "External API call failed",
        ),
      );
    },
  );

  return client;
};
