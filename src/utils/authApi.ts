import { apiClient } from "./api";
import { AuthUser } from "../types/auth";
import { parseAuthResponse, parseProfileResponse } from "./apiContracts";

// Auth API interfaces
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  tag: string;
  address: string;
  password: string;
}

export interface AuthResponse {
  message: string;
  user: {
    id: string;
    email: string;
    tag: string;
    address: string;
    photo: string;
    is_verified: boolean;
    kyc_status: string;
    created_at: string;
    updated_at: string;
    role?: string;
  };
}

// Auth API functions
export const authApi = {
  // Login user
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response = parseAuthResponse(await apiClient.post<unknown>(
        "/auth/login",
        credentials
      )) as AuthResponse;

      return response;
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  },

  // Register new user
  async register(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      const response = parseAuthResponse(await apiClient.post<unknown>(
        "/auth/register",
        userData
      )) as AuthResponse;

      return response;
    } catch (error) {
      console.error("Registration failed:", error);
      throw error;
    }
  },

  // Logout user
  async logout(): Promise<void> {
    await apiClient.post("/auth/logout");
  },

  // Get current user (if we add a /me endpoint later)
  async getCurrentUser(): Promise<AuthUser> {
    try {
      const response = await apiClient.get<unknown>(
        "/users/profile"
      );
      return parseProfileResponse(response) as AuthUser;
    } catch (error) {
      console.error("Failed to get current user:", error);
      throw error;
    }
  },

  // Check if user is authenticated
  isAuthenticated(): boolean {
    return false;
  },
};

// Helper function to convert backend user to frontend AuthUser format
export const mapBackendUserToAuthUser = (
  backendUser: AuthResponse["user"]
): AuthUser => {
  return {
    id: backendUser.id,
    tag: backendUser.tag,
    email: backendUser.email,
    address: backendUser.address,
    photo: backendUser.photo,
    is_verified: backendUser.is_verified,
    kyc_status: backendUser.kyc_status as
      | "none"
      | "pending"
      | "verified"
      | "rejected",
    created_at: backendUser.created_at,
    updated_at: backendUser.updated_at,
    last_login: new Date().toISOString(),
    role: (backendUser.role as "user" | "admin" | "super_admin") || "user",
  };
};
