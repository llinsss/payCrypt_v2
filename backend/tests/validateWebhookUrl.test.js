import { jest } from "@jest/globals";

jest.unstable_mockModule("dns", () => ({
  promises: {
    resolve4: jest.fn(),
    resolve6: jest.fn(),
  },
}));

const { validateWebhookUrl } = await import("../utils/validateWebhookUrl.js");
const { promises: dnsPromises } = await import("dns");

describe("validateWebhookUrl", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects non-https URLs", async () => {
    await expect(validateWebhookUrl("http://example.com/webhook")).rejects.toThrow("Webhook URL must use HTTPS.");
  });

  it("rejects localhost hostnames", async () => {
    await expect(validateWebhookUrl("https://localhost/webhook")).rejects.toThrow("Webhook URL must not target internal hostnames.");
  });

  it("rejects private IP addresses", async () => {
    await expect(validateWebhookUrl("https://10.0.0.1/webhook")).rejects.toThrow("Webhook URL must not target a private or reserved IP address.");
  });

  it("rejects private IPs resolved from hostname", async () => {
    dnsPromises.resolve4.mockResolvedValue(["10.0.0.1"]);
    dnsPromises.resolve6.mockResolvedValue([]);

    await expect(validateWebhookUrl("https://internal.example.com/webhook")).rejects.toThrow("Webhook URL resolves to a private or reserved IP address.");
  });

  it("accepts a valid public HTTPS URL", async () => {
    dnsPromises.resolve4.mockResolvedValue(["93.184.216.34"]);
    dnsPromises.resolve6.mockResolvedValue([]);

    await expect(validateWebhookUrl("https://example.com/webhook")).resolves.toBeUndefined();
  });
});
