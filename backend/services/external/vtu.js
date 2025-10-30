import { generateRequestId } from "../../utils/request-id.js";
import { setVTUToken, vtu } from "./index.js";

export const filterAndGroupBy = (items) => {
  if (!items.length > 1) return [];
  const availableItems = items.filter(
    (item) => item.availability.toLowerCase() !== "unavailable"
  );

  let response = availableItems;

  response = availableItems.reduce((acc, item) => {
    if (!acc[item.service_id]) acc[item.service_id] = [];
    item.reseller_price = undefined;
    item.availability = undefined;
    acc[item.service_id].push(item);
    return acc;
  }, {});

  return response;
};

const afterResponse = async (data) => {
  if (
    data?.data?.status === 403 ||
    data?.code === "rest_forbidden" ||
    data?.message.toUpperCase().includes("JWT")
  ) {
    await setVTUToken();
    return {
      success: true,
      message: "Successful",
      data: null,
    };
  }
};

export const balance = async () => {
  try {
    const url = "/api/v2/balance";
    const data = await vtu.get(url);
    return {
      success: true,
      message: "Successful",
      data: data.data?.balance || 0,
    };
  } catch (error) {
    console.log("VTU ERROR:____________", error?.message);
    return { success: false, message: error?.message, data: null };
  }
};

export const data_variations = async (service = null) => {
  try {
    let url = "/api/v2/variations/data";
    if (service) {
      url = `${url}?service_id=${service}`;
    }
    const data = await vtu.get(url);
    if (data?.data.length > 0) {
      const _data = filterAndGroupBy(data.data);
      return {
        success: true,
        message: "Successful",
        data: service ? _data[service] : _data,
      };
    }
    return { success: false, message: "Failed", data: null };
  } catch (error) {
    console.log("VTU ERROR:____________", error?.message);
    return { success: false, message: error?.message, data: null };
  }
};

export const tv_variations = async (service = null) => {
  try {
    let url = "/api/v2/variations/tv";
    if (service) {
      url = `${url}?service_id=${service}`;
    }
    const data = await vtu.get(url);
    if (data?.data.length > 0) {
      const _data = filterAndGroupBy(data.data);
      return {
        success: true,
        message: "Successful",
        data: service ? _data[service] : _data,
      };
    }
    return { success: false, message: "Failed", data: null };
  } catch (error) {
    console.log("VTU ERROR:____________", error?.message);
    return { success: false, message: error?.message, data: null };
  }
};

export const betting_services = async () => {
  try {
    const providers = [
      {
        service_name: "1xBet",
        service_id: "1xBet",
        logo: "/providers/1xbet.png",
      },
      {
        service_name: "BangBet",
        service_id: "BangBet",
        logo: "/providers/bangbet.png",
      },
      {
        service_name: "Bet9ja",
        service_id: "Bet9ja",
        logo: "/providers/bet9ja.png",
      },
      {
        service_name: "BetKing",
        service_id: "BetKing",
        logo: "/providers/betking.png",
      },
      {
        service_name: "BetLand",
        service_id: "BetLand",
        logo: "/providers/betland.png",
      },
      {
        service_name: "BetLion",
        service_id: "BetLion",
        logo: "/providers/betlion.png",
      },
      {
        service_name: "BetWay",
        service_id: "BetWay",
        logo: "/providers/betway.png",
      },
      {
        service_name: "CloudBet",
        service_id: "CloudBet",
        logo: "/providers/cloudbet.png",
      },
      {
        service_name: "LiveScoreBet",
        service_id: "LiveScoreBet",
        logo: "/providers/livescorebet.png",
      },
      {
        service_name: "MerryBet",
        service_id: "MerryBet",
        logo: "/providers/merrybet.png",
      },
      {
        service_name: "NaijaBet",
        service_id: "NaijaBet",
        logo: "/providers/naijabet.png",
      },
      {
        service_name: "NairaBet",
        service_id: "NairaBet",
        logo: "/providers/nairabet.png",
      },
      {
        service_name: "SupaBet",
        service_id: "SupaBet",
        logo: "/providers/supabet.png",
      },
    ];
    return { success: true, message: "Sccessful", data: providers };
  } catch (error) {
    console.log("VTU ERROR:____________", error?.message);
    return { success: false, message: error?.message, data: null };
  }
};

export const electricity_services = async () => {
  try {
    const providers = [
      {
        service_name: "Ikeja Electric",
        service_id: "ikeja-electric",
        logo: "/providers/ikeja-electric.png",
      },
      {
        service_name: "Eko Electric",
        service_id: "eko-electric",
        logo: "/providers/eko-electric.png",
      },
      {
        service_name: "Kano Electric",
        service_id: "kano-electric",
        logo: "/providers/kano-electric.png",
      },
      {
        service_name: "Portharcourt Electric",
        service_id: "portharcourt-electric",
        logo: "/providers/portharcourt-electric.png",
      },
      {
        service_name: "Jos Electric",
        service_id: "jos-electric",
        logo: "/providers/jos-electric.png",
      },
      {
        service_name: "Ibadan Electric",
        service_id: "ibadan-electric",
        logo: "/providers/ibadan-electric.png",
      },
      {
        service_name: "Kaduna Electric",
        service_id: "kaduna-electric",
        logo: "/providers/kaduna-electric.png",
      },
      {
        service_name: "Abuja Electric",
        service_id: "abuja-electric",
        logo: "/providers/abuja-electric.png",
      },
      {
        service_name: "Enugu Electric",
        service_id: "enugu-electric",
        logo: "/providers/enugu-electric.png",
      },
      {
        service_name: "Benin Electric",
        service_id: "benin-electric",
        logo: "/providers/benin-electric.png",
      },
      {
        service_name: "Aba Electric",
        service_id: "aba-electric",
        logo: "/providers/aba-electric.png",
      },
      {
        service_name: "Yola Electric",
        service_id: "yola-electric",
        logo: "/providers/yola-electric.png",
      },
    ];
    return { success: true, message: "Sccessful", data: providers };
  } catch (error) {
    console.log("VTU ERROR:____________", error?.message);
    return { success: false, message: error?.message, data: null };
  }
};

export const tv_services = async () => {
  try {
    const providers = [
      { service_id: "dstv", service_name: "DSTV", logo: "/providers/dstv.png" },
      { service_id: "gotv", service_name: "GOTV", logo: "/providers/gotv.png" },
      {
        service_id: "startimes",
        service_name: "Startimes",
        logo: "/providers/startimes.png",
      },
    ];
    return { success: true, message: "Sccessful", data: providers };
  } catch (error) {
    console.log("VTU ERROR:____________", error?.message);
    return { success: false, message: error?.message, data: null };
  }
};

export const airtime_and_data_services = async () => {
  try {
    const providers = [
      { service_id: "mtn", service_name: "MTN", logo: "/providers/mtn.png" },
      {
        service_id: "airtel",
        service_name: "Airtel",
        logo: "/providers/airtel.png",
      },
      { service_id: "glo", service_name: "Glo", logo: "/providers/glo.png" },
      {
        service_id: "9mobile",
        service_name: "9mobile",
        logo: "/providers/9mobile.png",
      },
    ];
    return { success: true, message: "Sccessful", data: providers };
  } catch (error) {
    console.log("VTU ERROR:____________", error?.message);
    return { success: false, message: error?.message, data: null };
  }
};

export const requery = async (request_id) => {
  try {
    const url = "/api/v2/requery";
    const data = await vtu.post(url, { request_id });
    if (
      data?.code === "success" &&
      data?.data &&
      data.data?.status !== "refunded-api"
    ) {
      return {
        success: true,
        message: "Successful",
        data: {
          ...data.data,
          session_id: request_id,
          completed: data.data.status === "completed-api" ? true : false,
        },
      };
    }
    return { success: false, message: "Failed", data: null };
  } catch (error) {
    console.log("VTU ERROR:____________", error?.message);
    return { success: false, message: error?.message, data: null };
  }
};

export const buy = async (payload, item) => {
  try {
    const request_id = generateRequestId();
    let url = "";
    let body = null;
    switch (item) {
      case "airtime":
        url = "/api/v2/airtime";
        body = {
          service_id: String(payload.service_id),
          phone: String(payload.phone),
          amount: Number(payload.amount),
          request_id,
        };
        break;
      case "data":
        url = "/api/v2/data";
        body = {
          service_id: String(payload.service_id),
          phone: String(payload.phone),
          variation_id: String(payload.variation_id),
          request_id,
        };
        break;
      case "electricity":
        url = "/api/v2/electricity";
        body = {
          service_id: String(payload.service_id),
          customer_id: String(payload.customer_id),
          variation_id: String(payload.variation_id),
          amount: Number(payload.amount),
          phone: payload.phone ?? null,
          request_id,
        };
        break;
      case "betting":
        url = "/api/v2/betting";
        body = {
          service_id: String(payload.service_id),
          customer_id: String(payload.customer_id),
          amount: Number(payload.amount),
          phone: payload.phone ?? null,
          request_id,
        };
        break;
      case "tv":
        url = "/api/v2/tv";
        body = {
          service_id: String(payload.service_id),
          customer_id: String(payload.customer_id),
          variation_id: String(payload.variation_id),
          amount: Number(payload.amount),
          subscription_type: String(payload.subscription_type ?? "change"),
          phone: payload.phone ?? null,
          request_id,
        };
        break;

      default:
        break;
    }
    if (!body || !url) {
      return {
        success: false,
        message: "Failed",
        data: { ...payload, session_id: request_id },
      };
    }
    const data = await vtu.post(url, body);
    if (data?.code === "success") {
      const txn = await requery(request_id);
      if (txn.success) {
        return {
          success: true,
          message: "Successful",
          data: txn.data,
          session_id: request_id,
        };
      }
      return {
        success: false,
        message: "Failed",
        data: { ...payload, session_id: request_id },
      };
    }
    return {
      success: false,
      message: "Failed",
      data: { ...payload, session_id: request_id },
    };
  } catch (error) {
    console.log("VTU ERROR:____________", error?.message);
    return { success: false, message: error?.message, data: null };
  }
};

export const verify = async (payload) => {
  try {
    const url = "/api/v2/verify-customer";
    const data = await vtu.post(url, payload);
    if (data?.code === "success" && data?.data) {
      return {
        success: true,
        message: "Successful",
        data: data.data,
      };
    }
    return {
      success: false,
      message: "Failed",
      data: null,
    };
  } catch (error) {
    console.log("VTU ERROR:____________", error?.message);
    return { success: false, message: error?.message, data: null };
  }
};
