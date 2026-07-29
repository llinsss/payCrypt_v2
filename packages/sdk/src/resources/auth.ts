import { HttpClient } from '../utils/http';
import { AuthResponse, LoginRequest, RegisterRequest } from '../types';

export class AuthResource {
  constructor(private http: HttpClient) {}

  /** Login with email and password */
  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await this.http.post<AuthResponse>('/auth/login', data);
    if (response.token) {
      this.http.setToken(response.token);
    }
    return response;
  }

  /** Register a new account with a @tag */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const response = await this.http.post<AuthResponse>('/auth/register', data);
    if (response.token) {
      this.http.setToken(response.token);
    }
    return response;
  }

  /** Get the current authenticated user's profile */
  async getProfile(): Promise<unknown> {
    return this.http.get('/users/profile');
  }

  /** Set a custom token refresh handler */
  setToken(token: string): void {
    this.http.setToken(token);
  }

  /** Clear the stored authentication token */
  clearToken(): void {
    this.http.setToken(undefined);
  }
}
