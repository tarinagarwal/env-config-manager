import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  authService,
  LoginCredentials,
  RegisterData,
  ResetPasswordData,
} from "../services/auth.service";
import { useAuthStore } from "../stores/authStore";
import { apiClient } from "../services/api";

export const useAuth = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setAuth, clearAuth } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: (credentials: LoginCredentials) =>
      authService.login(credentials),
    onSuccess: async (data) => {
      apiClient.setAuthToken(data.accessToken);
      apiClient.setRefreshToken(data.refreshToken);

      // Fetch user data
      const user = await authService.getCurrentUser();
      setAuth(user, data.accessToken, data.refreshToken);

      navigate("/dashboard");
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data: RegisterData) => authService.register(data),
    onSuccess: () => {
      navigate("/login");
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authService.logout(),
    onSuccess: () => {
      clearAuth();
      apiClient.clearTokens();
      queryClient.clear();
      navigate("/login");
    },
  });

  const requestPasswordResetMutation = useMutation({
    mutationFn: (email: string) => authService.requestPasswordReset(email),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (data: ResetPasswordData) => authService.resetPassword(data),
    onSuccess: () => {
      navigate("/login");
    },
  });

  return {
    login: loginMutation.mutate,
    loginAsync: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error,

    register: registerMutation.mutate,
    registerAsync: registerMutation.mutateAsync,
    isRegistering: registerMutation.isPending,
    registerError: registerMutation.error,

    logout: logoutMutation.mutate,
    isLoggingOut: logoutMutation.isPending,

    requestPasswordReset: requestPasswordResetMutation.mutate,
    isRequestingReset: requestPasswordResetMutation.isPending,
    requestResetError: requestPasswordResetMutation.error,
    requestResetSuccess: requestPasswordResetMutation.isSuccess,

    resetPassword: resetPasswordMutation.mutate,
    isResettingPassword: resetPasswordMutation.isPending,
    resetPasswordError: resetPasswordMutation.error,
  };
};

export const use2FA = () => {
  const enable2FAMutation = useMutation({
    mutationFn: () => authService.enable2FA(),
  });

  const verify2FAMutation = useMutation({
    mutationFn: (code: string) => authService.verify2FA(code),
  });

  const disable2FAMutation = useMutation({
    mutationFn: (code: string) => authService.disable2FA(code),
  });

  return {
    enable2FA: enable2FAMutation.mutate,
    enable2FAAsync: enable2FAMutation.mutateAsync,
    isEnabling2FA: enable2FAMutation.isPending,
    enable2FAData: enable2FAMutation.data,
    enable2FAError: enable2FAMutation.error,

    verify2FA: verify2FAMutation.mutate,
    verify2FAAsync: verify2FAMutation.mutateAsync,
    isVerifying2FA: verify2FAMutation.isPending,
    verify2FAError: verify2FAMutation.error,

    disable2FA: disable2FAMutation.mutate,
    isDisabling2FA: disable2FAMutation.isPending,
    disable2FAError: disable2FAMutation.error,
  };
};
