import {
  setApiKey,
  setTokens,
  clearAuth,
  isAuthenticated,
  getAuthHeader,
  getConfig,
} from "../utils/config";

describe("Authentication", () => {
  beforeEach(() => {
    // Clear auth before each test
    clearAuth();
    // Clear environment variables
    delete process.env.ENV_CONFIG_API_KEY;
    delete process.env.ENV_CONFIG_ACCESS_TOKEN;
  });

  describe("API Key Authentication", () => {
    it("should set and retrieve API key", () => {
      const apiKey = "test-api-key-123";
      setApiKey(apiKey);

      const config = getConfig();
      expect(config.apiKey).toBe(apiKey);
      expect(isAuthenticated()).toBe(true);
    });

    it("should generate correct auth header for API key", () => {
      const apiKey = "test-api-key-123";
      setApiKey(apiKey);

      const authHeader = getAuthHeader();
      expect(authHeader).toBe(`Bearer ${apiKey}`);
    });

    it("should clear tokens when setting API key", () => {
      setTokens("access-token", "refresh-token");
      setApiKey("api-key");

      const config = getConfig();
      expect(config.apiKey).toBe("api-key");
      expect(config.accessToken).toBeUndefined();
      expect(config.refreshToken).toBeUndefined();
    });
  });

  describe("OAuth Token Authentication", () => {
    it("should set and retrieve tokens", () => {
      const accessToken = "access-token-123";
      const refreshToken = "refresh-token-456";

      setTokens(accessToken, refreshToken);

      const config = getConfig();
      expect(config.accessToken).toBe(accessToken);
      expect(config.refreshToken).toBe(refreshToken);
      expect(isAuthenticated()).toBe(true);
    });

    it("should generate correct auth header for access token", () => {
      setTokens("access-token", "refresh-token");

      const authHeader = getAuthHeader();
      expect(authHeader).toBe("Bearer access-token");
    });

    it("should clear API key when setting tokens", () => {
      setApiKey("api-key");
      setTokens("access-token", "refresh-token");

      const config = getConfig();
      expect(config.apiKey).toBeUndefined();
      expect(config.accessToken).toBe("access-token");
    });
  });

  describe("Environment Variable Authentication (CI/CD)", () => {
    it("should use API key from environment variable", () => {
      process.env.ENV_CONFIG_API_KEY = "env-api-key";

      const config = getConfig();
      expect(config.apiKey).toBe("env-api-key");
      expect(isAuthenticated()).toBe(true);
    });

    it("should use access token from environment variable", () => {
      process.env.ENV_CONFIG_ACCESS_TOKEN = "env-access-token";

      const config = getConfig();
      expect(config.accessToken).toBe("env-access-token");
      expect(isAuthenticated()).toBe(true);
    });

    it("should prioritize environment variables over stored config", () => {
      setApiKey("stored-api-key");
      process.env.ENV_CONFIG_API_KEY = "env-api-key";

      const config = getConfig();
      expect(config.apiKey).toBe("env-api-key");
    });

    it("should generate auth header from environment variable", () => {
      process.env.ENV_CONFIG_API_KEY = "env-api-key";

      const authHeader = getAuthHeader();
      expect(authHeader).toBe("Bearer env-api-key");
    });
  });

  describe("Clear Authentication", () => {
    it("should clear all authentication data", () => {
      setApiKey("api-key");
      setTokens("access-token", "refresh-token");

      clearAuth();

      const config = getConfig();
      expect(config.apiKey).toBeUndefined();
      expect(config.accessToken).toBeUndefined();
      expect(config.refreshToken).toBeUndefined();
      expect(isAuthenticated()).toBe(false);
    });

    it("should return null auth header when not authenticated", () => {
      clearAuth();

      const authHeader = getAuthHeader();
      expect(authHeader).toBeNull();
    });
  });
});
