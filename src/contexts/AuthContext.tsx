import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthUser } from '../types';
import { authApi, mapBackendUserToAuthUser } from '../utils/authApi';
import { ApiError } from '../utils/api';

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (tag: string, email: string, password: string, walletAddress: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  updateUser: (userData: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for stored auth token and validate with backend
    const token = localStorage.getItem('auth_token');
    if (token) {
      // Try to get current user from backend
      authApi.getCurrentUser()
        .then(user => {
          setUser(user);
        })
        .catch(error => {
          console.error('Failed to validate token:', error);
          // Token might be invalid, remove it
          localStorage.removeItem('auth_token');
        })
        .finally(() => {
          setIsLoading(false);
        });
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await authApi.login({ email, password });
      const user = mapBackendUserToAuthUser(response.user);
      setUser(user);
    } catch (error) {
      if (error instanceof ApiError) {
        throw new Error(error.message);
      }
      throw new Error('Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (tag: string, email: string, password: string, walletAddress: string) => {
    setIsLoading(true);
    try {
      const response = await authApi.register({ 
        email, 
        tag, 
        address: walletAddress, 
        password 
      });
      const user = mapBackendUserToAuthUser(response.user);
      setUser(user);
    } catch (error) {
      if (error instanceof ApiError) {
        throw new Error(error.message);
      }
      throw new Error('Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    authApi.logout();
    setUser(null);
  };

  const updateUser = (userData: Partial<AuthUser>) => {
    if (user) {
      setUser({ ...user, ...userData });
    }
  };

  const value = {
    user,
    login,
    register,
    logout,
    isLoading,
    updateUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};