import auditService from "../audit.service";
import prisma from "../../lib/prisma";
import { AuditEvent, AuditFilters } from "../../types/audit.types";

// Mock dependencies
jest.mock("../../lib/prisma", () => ({
  __esModule: true,
  default: {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

// Mock fetch for SIEM webhook testing
global.fetch = jest.fn();

describe("AuditService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("log", () => {
    it("should successfully log an audit event", async () => {
      const event: AuditEvent = {
        userId: "user-123",
        action: "variable.create",
        resourceType: "variable",
        resourceId: "var-123",
        metadata: { key: "API_KEY" },
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        timestamp: new Date(),
      };

      (prisma.auditLog.create as jest.Mock).mockResolvedValue({
        id: "log-123",
        ...event,
        severity: "info",
      });

      await auditService.log(event);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: event.userId,
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          metadata: event.metadata,
          ipAddress: event.ipAddress,
          userAgent: event.userAgent,
          severity: "info",
          createdAt: event.timestamp,
        },
      });
    });

    it("should determine critical severity for failed login", async () => {
      const event: AuditEvent = {
        action: "auth.login.failed",
        resourceType: "user",
        timestamp: new Date(),
      };

      (prisma.auditLog.create as jest.Mock).mockResolvedValue({
        id: "log-123",
        ...event,
        severity: "critical",
      });

      await auditService.log(event);

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: "critical",
          }),
        })
      );
    });

    it("should determine warning severity for delete actions", async () => {
      const event: AuditEvent = {
        action: "variable.delete",
        resourceType: "variable",
        timestamp: new Date(),
      };

      (prisma.auditLog.create as jest.Mock).mockResolvedValue({
        id: "log-123",
        ...event,
        severity: "warning",
      });

      await auditService.log(event);

      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            severity: "warning",
          }),
        })
      );
    });

    it("should not throw error if logging fails", async () => {
      const event: AuditEvent = {
        action: "variable.create",
        resourceType: "variable",
        timestamp: new Date(),
      };

      (prisma.auditLog.create as jest.Mock).mockRejectedValue(
        new Error("Database error")
      );

      // Should not throw
      await expect(auditService.log(event)).resolves.not.toThrow();
    });
  });

  describe("query", () => {
    it("should query audit logs with filters", async () => {
      const mockLogs = [
        {
          id: "log-1",
          userId: "user-123",
          action: "variable.create",
          resourceType: "variable",
          resourceId: "var-1",
          metadata: {},
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
          severity: "info",
          createdAt: new Date(),
          user: { id: "user-123", email: "test@example.com" },
        },
      ];

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue(mockLogs);

      const filters: AuditFilters = {
        userId: "user-123",
        action: "variable.create",
      };

      const result = await auditService.query(filters);

      expect(result).toHaveLength(1);
      expect(result[0].action).toBe("variable.create");
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          userId: "user-123",
          action: "variable.create",
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 1000,
        include: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });
    });

    it("should filter by date range", async () => {
      const startDate = new Date("2024-01-01");
      const endDate = new Date("2024-12-31");

      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

      const filters: AuditFilters = {
        startDate,
        endDate,
      };

      await auditService.query(filters);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
        })
      );
    });

    it("should filter by severity", async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([]);

      const filters: AuditFilters = {
        severity: "critical",
      };

      await auditService.query(filters);

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            severity: "critical",
          },
        })
      );
    });
  });

  describe("export", () => {
    const mockLogs = [
      {
        id: "log-1",
        userId: "user-123",
        action: "variable.create",
        resourceType: "variable",
        resourceId: "var-1",
        metadata: {},
        ipAddress: "192.168.1.1",
        userAgent: "Mozilla/5.0",
        severity: "info",
        timestamp: new Date("2024-01-01T12:00:00Z"),
      },
    ];

    beforeEach(() => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
        {
          ...mockLogs[0],
          createdAt: mockLogs[0].timestamp,
          user: { id: "user-123", email: "test@example.com" },
        },
      ]);
    });

    it("should export logs in JSON format", async () => {
      const result = await auditService.export({}, "json");

      expect(result).toContain('"action": "variable.create"');
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it("should export logs in CSV format", async () => {
      const result = await auditService.export({}, "csv");

      expect(result).toContain("ID,User ID,Action");
      expect(result).toContain("log-1");
      expect(result).toContain("variable.create");
      expect(result.split("\n").length).toBeGreaterThan(1);
    });

    it("should escape CSV values properly", async () => {
      (prisma.auditLog.findMany as jest.Mock).mockResolvedValue([
        {
          id: "log-1",
          userId: "user-123",
          action: 'test"action',
          resourceType: "variable",
          resourceId: "var-1",
          metadata: {},
          ipAddress: "192.168.1.1",
          userAgent: "Mozilla/5.0",
          severity: "info",
          createdAt: new Date(),
          user: { id: "user-123", email: "test@example.com" },
        },
      ]);

      const result = await auditService.export({}, "csv");

      expect(result).toContain('""'); // Escaped quote
    });
  });

  describe("enforceRetention", () => {
    it("should delete logs older than retention period for free plan", async () => {
      (prisma.auditLog.deleteMany as jest.Mock).mockResolvedValue({
        count: 10,
      });

      const result = await auditService.enforceRetention("user-123", "free");

      expect(result).toBe(10);
      expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: "user-123",
          createdAt: {
            lt: expect.any(Date),
          },
        },
      });
    });

    it("should use correct retention period for enterprise plan", async () => {
      (prisma.auditLog.deleteMany as jest.Mock).mockResolvedValue({
        count: 5,
      });

      await auditService.enforceRetention("user-123", "enterprise");

      const call = (prisma.auditLog.deleteMany as jest.Mock).mock.calls[0][0];
      const cutoffDate = call.where.createdAt.lt;
      const daysDiff = Math.floor(
        (new Date().getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Should be approximately 730 days (2 years)
      expect(daysDiff).toBeGreaterThan(725);
      expect(daysDiff).toBeLessThan(735);
    });
  });

  describe("triggerSiemWebhook", () => {
    it("should successfully trigger SIEM webhook", async () => {
      const event: AuditEvent = {
        userId: "user-123",
        action: "variable.create",
        resourceType: "variable",
        timestamp: new Date(),
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      await auditService.triggerSiemWebhook(
        event,
        "https://siem.example.com/webhook"
      );

      expect(global.fetch).toHaveBeenCalledWith(
        "https://siem.example.com/webhook",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: expect.stringContaining("variable.create"),
        })
      );
    });

    it("should handle webhook failure gracefully", async () => {
      const event: AuditEvent = {
        action: "variable.create",
        resourceType: "variable",
        timestamp: new Date(),
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      // Should not throw
      await expect(
        auditService.triggerSiemWebhook(
          event,
          "https://siem.example.com/webhook"
        )
      ).resolves.not.toThrow();
    });

    it("should handle network errors gracefully", async () => {
      const event: AuditEvent = {
        action: "variable.create",
        resourceType: "variable",
        timestamp: new Date(),
      };

      (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

      // Should not throw
      await expect(
        auditService.triggerSiemWebhook(
          event,
          "https://siem.example.com/webhook"
        )
      ).resolves.not.toThrow();
    });
  });
});
