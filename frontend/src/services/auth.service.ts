import { apiClient } from "./api";
import type { User, AuthToken } from "../types";

export interface LoginCredentials {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface RegisterData {
  email: string;
  password: string;
}

export interface ResetPasswordData {
  token: string;
  password: string;
}

export interface TwoFactorSecret {
  secret: string;
  qrCode: string;
}

export const authService = {
  async register(data: RegisterData): Promise<User> {
    return apiClient.post<User>("/auth/register", data);
  },

  async login(credentials: LoginCredentials): Promise<AuthToken> {
    return apiClient.post<AuthToken>("/auth/login", credentials);
  },

  async loginWithGoogle(code: string): Promise<AuthToken> {
    return apiClient.post<AuthToken>("/auth/oauth/google", { code });
  },

  async loginWithGithub(code: string): Promise<AuthToken> {
    return apiClient.post<AuthToken>("/auth/oauth/github", { code });
  },

  async logout(): Promise<void> {
    return apiClient.post<void>("/auth/logout");
  },

  async refreshToken(refreshToken: string): Promise<AuthToken> {
    return apiClient.post<AuthToken>("/auth/refresh", { refreshToken });
  },

  async getCurrentUser(): Promise<User> {
    return apiClient.get<User>("/auth/me");
  },

  async requestPasswordReset(email: string): Promise<void> {
    return apiClient.post<void>("/auth/forgot-password", { email });
  },

  async resetPassword(data: ResetPasswordData): Promise<void> {
    return apiClient.post<void>("/auth/reset-password", data);
  },

  async enable2FA(): Promise<TwoFactorSecret> {
    return apiClient.post<TwoFactorSecret>("/auth/2fa/enable");
  },

  async verify2FA(code: string): Promise<void> {
    return apiClient.post<void>("/auth/2fa/verify", { code });
  },

  async disable2FA(code: string): Promise<void> {
    return apiClient.post<void>("/auth/2fa/disable", { code });
  },
};
