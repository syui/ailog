import axios from 'axios';

const API_BASE = '/api/v1';

interface LoginRequest {
  identifier: string;  // Handle or DID
  password: string;    // App password
}

interface LoginResponse {
  access_token: string;
  token_type: string;
  did: string;
  handle: string;
}

interface User {
  did: string;
  handle: string;
  avatar?: string;
  displayName?: string;
}

class AuthService {
  private token: string | null = null;
  private user: User | null = null;

  constructor() {
    // Load token from localStorage
    this.token = localStorage.getItem('ai_card_token');
    
    // Set default auth header if token exists
    if (this.token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${this.token}`;
    }
  }

  async login(identifier: string, password: string): Promise<LoginResponse> {
    try {
      const response = await axios.post<LoginResponse>(`${API_BASE}/auth/login`, {
        identifier,
        password
      });

      const { access_token, did, handle } = response.data;

      // Store token
      this.token = access_token;
      localStorage.setItem('ai_card_token', access_token);
      
      // Set auth header
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      // Store user info
      this.user = { did, handle };

      return response.data;
    } catch (error) {
      throw new Error('Login failed');
    }
  }

  async logout(): Promise<void> {
    try {
      await axios.post(`${API_BASE}/auth/logout`);
    } catch (error) {
      // Ignore errors
    }

    // Clear token
    this.token = null;
    this.user = null;
    localStorage.removeItem('ai_card_token');
    delete axios.defaults.headers.common['Authorization'];
  }

  async verify(): Promise<User | null> {
    if (!this.token) {
      return null;
    }

    try {
      const response = await axios.get<User & { valid: boolean }>(`${API_BASE}/auth/verify`);
      if (response.data.valid) {
        this.user = {
          did: response.data.did,
          handle: response.data.handle
        };
        return this.user;
      }
    } catch (error) {
      // Token is invalid
      this.logout();
    }

    return null;
  }

  getUser(): User | null {
    return this.user;
  }

  isAuthenticated(): boolean {
    return this.token !== null;
  }
}

export const authService = new AuthService();
export type { User, LoginRequest, LoginResponse };