import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import LandingPage from "./LandingPage";
import * as api from "../../utils/api";

// Mock the API
jest.mock("../../utils/api", () => ({
  apiClient: {
    get: jest.fn(),
  },
}));

describe("LandingPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render landing page with hero section", () => {
    (api.apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          totalTransactions: 0,
          totalUsers: 0,
          totalVolume: 0,
          totalVolumeCurrency: "USD",
          supportedChains: [],
        },
      },
    });

    render(<LandingPage />);

    expect(screen.getByText(/Secure Transactions, Simplified/i)).toBeInTheDocument();
    expect(screen.getByText(/Download App/i)).toBeInTheDocument();
  });

  it("should fetch and display platform statistics", async () => {
    (api.apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          totalTransactions: 45320,
          totalUsers: 8750,
          totalVolume: 5234560.5,
          totalVolumeCurrency: "USD",
          supportedChains: ["stellar", "ethereum", "polygon"],
        },
      },
    });

    render(<LandingPage />);

    // Wait for API call and animation to complete
    await waitFor(() => {
      expect(screen.getByText("Live Platform Stats")).toBeInTheDocument();
    });

    // Verify stats are fetched
    expect(api.apiClient.get).toHaveBeenCalledWith("/public/stats");
  });

  it("should display animated transaction count", async () => {
    (api.apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          totalTransactions: 45320,
          totalUsers: 8750,
          totalVolume: 5234560.5,
          totalVolumeCurrency: "USD",
          supportedChains: ["stellar", "ethereum", "polygon"],
        },
      },
    });

    render(<LandingPage />);

    // Animation completes after 1.5 seconds
    await waitFor(
      () => {
        expect(screen.getByText(/45,320/)).toBeInTheDocument();
      },
      { timeout: 2000 }
    );
  });

  it("should display supported chains", async () => {
    (api.apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          totalTransactions: 45320,
          totalUsers: 8750,
          totalVolume: 5234560.5,
          totalVolumeCurrency: "USD",
          supportedChains: ["stellar", "ethereum", "polygon"],
        },
      },
    });

    render(<LandingPage />);

    await waitFor(() => {
      expect(screen.getByText(/stellar/i)).toBeInTheDocument();
      expect(screen.getByText(/ethereum/i)).toBeInTheDocument();
      expect(screen.getByText(/polygon/i)).toBeInTheDocument();
    });
  });

  it("should display app download CTAs", () => {
    (api.apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          totalTransactions: 0,
          totalUsers: 0,
          totalVolume: 0,
          totalVolumeCurrency: "USD",
          supportedChains: [],
        },
      },
    });

    render(<LandingPage />);

    expect(screen.getByText(/Download on App Store/i)).toBeInTheDocument();
    expect(screen.getByText(/Get it on Google Play/i)).toBeInTheDocument();
  });

  it("should display features section", () => {
    (api.apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        success: true,
        data: {
          totalTransactions: 0,
          totalUsers: 0,
          totalVolume: 0,
          totalVolumeCurrency: "USD",
          supportedChains: [],
        },
      },
    });

    render(<LandingPage />);

    expect(screen.getByText(/Why Choose T@gged/i)).toBeInTheDocument();
    expect(screen.getByText(/Secure/i)).toBeInTheDocument();
    expect(screen.getByText(/Fast/i)).toBeInTheDocument();
    expect(screen.getByText(/Global/i)).toBeInTheDocument();
    expect(screen.getByText(/Low Fees/i)).toBeInTheDocument();
  });

  it("should handle API errors gracefully", async () => {
    (api.apiClient.get as jest.Mock).mockRejectedValue(new Error("API Error"));

    const { rerender } = render(<LandingPage />);

    // Should still render without stats
    expect(screen.getByText(/Secure Transactions, Simplified/i)).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument(); // Loading placeholder
  });

  it("should include open graph meta tags", () => {
    render(<LandingPage />);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    const ogDescription = document.querySelector('meta[property="og:description"]');
    const ogImage = document.querySelector('meta[property="og:image"]');

    expect(ogTitle?.getAttribute("content")).toBe("T@gged - Secure Multi-Chain Crypto Transactions");
    expect(ogDescription?.getAttribute("content")).toContain("Fast, secure, and easy crypto transactions");
    expect(ogImage?.getAttribute("content")).toContain("og-image.png");
  });

  it("should include JSON-LD structured data", () => {
    render(<LandingPage />);

    const jsonLd = document.querySelector('script[type="application/ld+json"]');
    expect(jsonLd).toBeInTheDocument();

    if (jsonLd) {
      const data = JSON.parse(jsonLd.textContent || "{}");
      expect(data["@context"]).toBe("https://schema.org");
    }
  });
});
