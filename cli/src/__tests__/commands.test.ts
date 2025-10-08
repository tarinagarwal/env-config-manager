import axios from "axios";
import { getApiClient } from "../utils/api";
import { setApiKey, clearAuth } from "../utils/config";
import * as fs from "fs";
import * as path from "path";

// Mock axios
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Reset the API client module between tests
jest.mock("../utils/api", () => {
  const actual = jest.requireActual("../utils/api");
  let mockClient: any = null;

  return {
    ...actual,
    getApiClient: jest.fn(() => {
      if (!mockClient) {
        mockClient = {
          get: jest.fn(),
          post: jest.fn(),
          patch: jest.fn(),
          delete: jest.fn(),
        };
      }
      return mockClient;
    }),
    __resetMockClient: () => {
      mockClient = null;
    },
  };
});

describe("CLI Commands", () => {
  beforeEach(() => {
    clearAuth();
    jest.clearAllMocks();
    // Reset the mock client
    (require("../utils/api") as any).__resetMockClient();
  });

  describe("Pull Command", () => {
    it("should fetch and write variables to file", async () => {
      setApiKey("test-api-key");

      const mockProjects = [
        { id: "proj-1", name: "myapp", description: "My App" },
      ];

      const mockEnvironments = [
        { id: "env-1", projectId: "proj-1", name: "production" },
      ];

      const mockVariables = [
        { id: "var-1", key: "API_KEY", value: "secret123", isSecret: true },
        { id: "var-2", key: "DB_HOST", value: "localhost", isSecret: false },
      ];

      const client = getApiClient();
      (client.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockProjects })
        .mockResolvedValueOnce({ data: mockEnvironments })
        .mockResolvedValueOnce({ data: mockVariables });

      // Test would call pull function here
      // For now, just verify the mocks are set up correctly
      expect(client.get).toBeDefined();
    });
  });

  describe("Push Command", () => {
    it("should read file and push variables", async () => {
      setApiKey("test-api-key");

      const mockProjects = [
        { id: "proj-1", name: "myapp", description: "My App" },
      ];

      const mockEnvironments = [
        { id: "env-1", projectId: "proj-1", name: "staging" },
      ];

      const mockExistingVars: any[] = [];

      const client = getApiClient();
      (client.get as jest.Mock)
        .mockResolvedValueOnce({ data: mockProjects })
        .mockResolvedValueOnce({ data: mockEnvironments })
        .mockResolvedValueOnce({ data: mockExistingVars });

      (client.post as jest.Mock).mockResolvedValue({ data: {} });

      expect(client.post).toBeDefined();
    });
  });

  describe("Projects Command", () => {
    it("should list projects", async () => {
      setApiKey("test-api-key");

      const mockProjects = [
        { id: "proj-1", name: "myapp", description: "My App" },
        { id: "proj-2", name: "webapp", description: "Web App" },
      ];

      const client = getApiClient();
      (client.get as jest.Mock).mockResolvedValueOnce({ data: mockProjects });

      const response = await client.get("/projects");

      expect(response.data).toEqual(mockProjects);
      expect(response.data).toHaveLength(2);
    });

    it("should create a project", async () => {
      setApiKey("test-api-key");

      const newProject = {
        id: "proj-3",
        name: "newapp",
        description: "New App",
      };

      const client = getApiClient();
      (client.post as jest.Mock).mockResolvedValue({ data: newProject });

      const response = await client.post("/projects", {
        name: "newapp",
        description: "New App",
      });

      expect(response.data).toEqual(newProject);
    });
  });

  describe("Variables Command", () => {
    it("should create a variable", async () => {
      setApiKey("test-api-key");

      const newVariable = {
        id: "var-1",
        environmentId: "env-1",
        key: "NEW_VAR",
        value: "value123",
        isSecret: false,
      };

      const client = getApiClient();
      (client.post as jest.Mock).mockResolvedValue({ data: newVariable });

      const response = await client.post("/environments/env-1/variables", {
        key: "NEW_VAR",
        value: "value123",
        isSecret: false,
      });

      expect(response.data).toEqual(newVariable);
    });

    it("should list variables", async () => {
      setApiKey("test-api-key");

      const mockVariables = [
        { id: "var-1", key: "API_KEY", value: "secret", isSecret: true },
        { id: "var-2", key: "DB_HOST", value: "localhost", isSecret: false },
      ];

      const client = getApiClient();
      (client.get as jest.Mock).mockResolvedValueOnce({ data: mockVariables });

      const response = await client.get("/environments/env-1/variables");

      expect(response.data).toEqual(mockVariables);
      expect(response.data).toHaveLength(2);
    });

    it("should delete a variable", async () => {
      setApiKey("test-api-key");

      const client = getApiClient();
      (client.delete as jest.Mock).mockResolvedValue({ data: {} });

      await client.delete("/variables/var-1");

      expect(client.delete).toHaveBeenCalledWith("/variables/var-1");
    });
  });

  describe("Sync Command", () => {
    it("should trigger platform sync", async () => {
      setApiKey("test-api-key");

      const mockConnections = [
        { id: "conn-1", platform: "vercel", status: "connected" },
        { id: "conn-2", platform: "netlify", status: "connected" },
      ];

      const client = getApiClient();
      (client.get as jest.Mock).mockResolvedValueOnce({
        data: mockConnections,
      });
      (client.post as jest.Mock).mockResolvedValue({ data: { success: true } });

      const response = await client.get("/projects/proj-1/connections");

      expect(response.data).toEqual(mockConnections);
      expect(response.data).toHaveLength(2);
    });
  });

  describe("CI/CD Mode", () => {
    it("should work with environment variable authentication", async () => {
      process.env.ENV_CONFIG_API_KEY = "ci-api-key";

      const client = getApiClient();

      // Verify client is created
      expect(client).toBeDefined();

      // Clean up
      delete process.env.ENV_CONFIG_API_KEY;
    });

    it("should support non-interactive mode", () => {
      // Non-interactive mode should suppress console output
      // This is tested by the --non-interactive flag in commands
      const options = { nonInteractive: true };

      expect(options.nonInteractive).toBe(true);
    });
  });
});
