import { apiClient } from './api';
import { AuthUser } from '../types';

// Auth API interfaces
export interface LoginRequest {
  entity: string;
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
  token: string;
  user: {
    id: string;
    email: string;
    tag: string;
    photo: string;
    kyc_status: string;
  };
}

// Auth API functions
export const authApi = {
  // Login user
  async login(credentials: LoginRequest): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
      
      // Store token in localStorage
      if (response.token) {
        localStorage.setItem('auth_token', response.token);
      }
      
      return response;
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  },

  // Register new user
  async register(userData: RegisterRequest): Promise<AuthResponse> {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/register', userData);
      
      // Store token in localStorage
      if (response.token) {
        localStorage.setItem('auth_token', response.token);
      }
      
      return response;
    } catch (error) {
      console.error('Registration failed:', error);
      throw error;
    }
  },

  // Logout user
  logout(): void {
    localStorage.removeItem('auth_token');
  },

  // Get current user (if we add a /me endpoint later)
  async getCurrentUser(): Promise<AuthUser> {
    try {
      const response = await apiClient.get<{ user: AuthResponse['user'] }>('/auth/me');
      return mapBackendUserToAuthUser(response.user);
    } catch (error) {
      console.error('Failed to get current user:', error);
      throw error;
    }
  },

  // Check if user is authenticated
  isAuthenticated(): boolean {
    const token = localStorage.getItem('auth_token');
    return !!token;
  },

  // Get stored token
  getToken(): string | null {
    return localStorage.getItem('auth_token');
  }
};

// Helper function to convert backend user to frontend AuthUser format
export const mapBackendUserToAuthUser = (backendUser: AuthResponse['user']): AuthUser => {
  // Map backend KYC status to frontend format
  const mapKycStatus = (status: string): 'none' | 'pending' | 'verified' | 'rejected' => {
    switch (status) {
      case 'not_started':
        return 'none';
      case 'pending':
        return 'pending';
      case 'verified':
        return 'verified';
      case 'rejected':
        return 'rejected';
      default:
        return 'none';
    }
  };

  return {
    id: backendUser.id,
    tag: backendUser.tag,
    email: backendUser.email,
    walletAddress: '', // Will need to get this from user profile or wallet endpoint
    isVerified: false, // Default value, can be updated later
    kycStatus: mapKycStatus(backendUser.kyc_status),
    createdAt: new Date().toISOString(), // Default to current time
    lastLogin: new Date().toISOString(),
    role: 'user' // Default role
  };
};
