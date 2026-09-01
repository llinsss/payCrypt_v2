import axios, { AxiosInstance } from "axios";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002/api/v2";

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      withCredentials: true,
    });

    this.client.interceptors.response.use(
      (response) => response,
      async (error) => {
        if (error.response?.status === 401) {
          try {
            await this.refreshToken();
            return this.client.request(error.config);
          } catch {
            this.logout();
          }
        }
        return Promise.reject(error);
      }
    );
  }

  async login(email: string, password: string) {
    const response = await this.client.post("/auth/login", { email, password });
    return response.data;
  }

  async register(email: string, tag: string, password: string, address: string, referralCode?: string) {
    const response = await this.client.post("/auth/register", {
      email,
      tag,
      password,
      address,
      referralCode,
    });
    return response.data;
  }

  async refreshToken() {
    const response = await this.client.post("/auth/refresh");
    return response.data;
  }

  logout() {
    if (typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }

  async getUser() {
    const response = await this.client.get("/users/me");
    return response.data;
  }

  async getTransactions(page = 1, limit = 10) {
    const response = await this.client.get("/transactions", {
      params: { page, limit },
    });
    return response.data;
  }

  async searchTransactions(query: string, filters?: any) {
    const response = await this.client.get("/transactions/search", {
      params: { q: query, ...filters },
    });
    return response.data;
  }

  async sendPayment(recipientTag: string, amount: number, balanceId: number) {
    const response = await this.client.post("/wallets/send-to-tag", {
      receiver_tag: recipientTag,
      amount,
      balance_id: balanceId,
    });
    return response.data;
  }

  async getWallets() {
    const response = await this.client.get("/wallets");
    return response.data;
  }

  async getBalances() {
    const response = await this.client.get("/balances");
    return response.data;
  }

  async getAllowances(address: string, chain?: string) {
    const response = await this.client.get(`/wallets/${address}/allowances`, {
      params: chain ? { chain } : undefined,
    });
    return response.data;
  }
}

export const apiClient = new ApiClient();
