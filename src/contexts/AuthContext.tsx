import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { AuthUser } from '../types';

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
    // Check for stored auth token and validate
    const token = localStorage.getItem('auth_token');
    if (token) {
      // In a real app, validate token with backend
      const mockUser: AuthUser = {
        id: '1',
        tag: 'llins',
        email: 'user@example.com',
        walletAddress: '0x742d35Cc6634C0532925a3b8D404FdDA8C6b8AC2',
        isVerified: true,
        kycStatus: 'verified',
        createdAt: '2024-01-15T10:30:00Z',
        lastLogin: new Date().toISOString(),
        role: 'user'
      };
      setUser(mockUser);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const mockUser: AuthUser = {
        id: '1',
        tag: email.split('@')[0],
        email,
        walletAddress: '0x742d35Cc6634C0532925a3b8D404FdDA8C6b8AC2',
        isVerified: true,
        kycStatus: 'verified',
        createdAt: '2024-01-15T10:30:00Z',
        lastLogin: new Date().toISOString(),
        role: email.includes('admin') ? 'admin' : 'user'
      };
      
      setUser(mockUser);
      localStorage.setItem('auth_token', 'mock_token_' + Date.now());
    } catch (error) {
      throw new Error('Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (tag: string, email: string, password: string, walletAddress: string) => {
    setIsLoading(true);
    try {
      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const newUser: AuthUser = {
        id: Date.now().toString(),
        tag,
        email,
        walletAddress,
        isVerified: false,
        kycStatus: 'none',
        createdAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        role: 'user'
      };
      
      setUser(newUser);
      localStorage.setItem('auth_token', 'mock_token_' + Date.now());
    } catch (error) {
      throw new Error('Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('auth_token');
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