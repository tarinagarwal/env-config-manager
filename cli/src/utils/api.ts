import axios, { AxiosInstance, AxiosError } from "axios";
import { getConfig, getAuthHeader, setTokens } from "./config";
import { ApiError, AuthResponse } from "../types";
import chalk from "chalk";

let apiClient: AxiosInstance | null = null;

export function getApiClient(): AxiosInstance {
  if (!apiClient) {
    const config = getConfig();

    apiClient = axios.create({
      baseURL: config.apiUrl,
      timeout: 30000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Request interceptor to add auth header
    apiClient.interceptors.request.use((config) => {
      const authHeader = getAuthHeader();
      if (authHeader) {
        config.headers.Authorization = authHeader;
      }
      return config;
    });

    // Response interceptor to handle token refresh
    apiClient.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config;

        // If 401 and we have a refresh token, try to refresh
        if (error.response?.status === 401 && originalRequest) {
          const cfg = getConfig();
          if (cfg.refreshToken) {
            try {
              const response = await axios.post<AuthResponse>(
                `${cfg.apiUrl}/auth/refresh`,
                { refreshToken: cfg.refreshToken }
              );

              setTokens(response.data.accessToken, response.data.refreshToken);

              // Retry original request
              const authHeader = getAuthHeader();
              if (authHeader && originalRequest.headers) {
                originalRequest.headers.Authorization = authHeader;
              }
              return apiClient!(originalRequest);
            } catch (refreshError) {
              // Refresh failed, user needs to login again
              console.error(chalk.red("Session expired. Please login again."));
              process.exit(1);
            }
          }
        }

        return Promise.reject(error);
      }
    );
  }

  return apiClient;
}

export function handleApiError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data as ApiError | undefined;

    if (apiError?.error) {
      console.error(chalk.red(`Error: ${apiError.error.message}`));
      if (apiError.error.details) {
        console.error(
          chalk.gray(JSON.stringify(apiError.error.details, null, 2))
        );
      }
    } else {
      console.error(chalk.red(`Error: ${error.message}`));
    }
  } else if (error instanceof Error) {
    console.error(chalk.red(`Error: ${error.message}`));
  } else {
    console.error(chalk.red("An unknown error occurred"));
  }

  process.exit(1);
}
