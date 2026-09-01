import React, { useEffect, useState } from "react";
import { apiClient } from "../../utils/api";

interface Stats {
  totalTransactions: number;
  totalUsers: number;
  totalVolume: number;
  totalVolumeCurrency: string;
  supportedChains: string[];
}

const LandingPage: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [animatedStats, setAnimatedStats] = useState({
    transactions: 0,
    users: 0,
    volume: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await apiClient.get("/public/stats");
        if (response.data.success) {
          setStats(response.data.data);
          // Animate numbers
          animateNumbers(response.data.data);
        }
      } catch (error) {
        console.error("Failed to fetch platform stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const animateNumbers = (data: Stats) => {
    const duration = 1500; // 1.5 seconds
    const steps = 60;
    const stepDuration = duration / steps;

    let currentStep = 0;
    const txStep = data.totalTransactions / steps;
    const userStep = data.totalUsers / steps;
    const volumeStep = data.totalVolume / steps;

    const interval = setInterval(() => {
      currentStep++;
      setAnimatedStats({
        transactions: Math.floor(txStep * currentStep),
        users: Math.floor(userStep * currentStep),
        volume: Math.floor(volumeStep * currentStep),
      });

      if (currentStep >= steps) {
        clearInterval(interval);
        setAnimatedStats({
          transactions: data.totalTransactions,
          users: data.totalUsers,
          volume: data.totalVolume,
        });
      }
    }, stepDuration);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-black/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold">T@gged</div>
          <div className="space-x-6">
            <a href="#features" className="hover:text-purple-400 transition">
              Features
            </a>
            <a href="#stats" className="hover:text-purple-400 transition">
              Stats
            </a>
            <a href="#download" className="hover:text-purple-400 transition">
              Download
            </a>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center">
          <h1 className="text-5xl sm:text-6xl font-bold mb-6 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            Secure Transactions, Simplified
          </h1>
          <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
            Send, receive, and manage crypto across multiple chains with ease. Fast, secure, and built for everyone.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a
              href="#download"
              className="px-8 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition"
            >
              Download App
            </a>
            <a
              href="https://docs.tagged.example.com"
              className="px-8 py-3 border-2 border-purple-400 hover:bg-purple-400/10 rounded-lg font-semibold transition"
            >
              View Docs
            </a>
          </div>
        </div>
      </section>

      {/* Live Statistics */}
      <section id="stats" className="bg-black/30 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-4xl font-bold text-center mb-16">Live Platform Stats</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Transactions */}
            <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 border border-purple-400/30 rounded-lg p-8 text-center">
              <div className="text-5xl font-bold text-purple-400 mb-2">
                {loading ? "—" : animatedStats.transactions.toLocaleString()}
              </div>
              <p className="text-gray-300">Total Transactions</p>
            </div>

            {/* Users */}
            <div className="bg-gradient-to-br from-blue-600/20 to-cyan-600/20 border border-blue-400/30 rounded-lg p-8 text-center">
              <div className="text-5xl font-bold text-blue-400 mb-2">
                {loading ? "—" : animatedStats.users.toLocaleString()}
              </div>
              <p className="text-gray-300">Active Users</p>
            </div>

            {/* Volume */}
            <div className="bg-gradient-to-br from-green-600/20 to-emerald-600/20 border border-green-400/30 rounded-lg p-8 text-center">
              <div className="text-5xl font-bold text-green-400 mb-2">
                {loading
                  ? "—"
                  : `$${(animatedStats.volume / 1000000).toFixed(1)}M`}
              </div>
              <p className="text-gray-300">Transaction Volume</p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <h2 className="text-4xl font-bold text-center mb-16">Why Choose T@gged</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { icon: "🔒", title: "Secure", desc: "Military-grade encryption" },
            { icon: "⚡", title: "Fast", desc: "Instant transactions" },
            { icon: "🌍", title: "Global", desc: "Multi-chain support" },
            { icon: "💰", title: "Low Fees", desc: "Minimal transaction costs" },
          ].map((feature, idx) => (
            <div key={idx} className="text-center">
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-300">{feature.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Supported Chains */}
      <section className="bg-black/30 py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-12">Supported Chains</h2>
          <div className="flex justify-center items-center flex-wrap gap-8">
            {stats?.supportedChains.map((chain) => (
              <div
                key={chain}
                className="bg-white/10 border border-white/20 rounded-lg px-8 py-4 text-lg font-semibold capitalize hover:bg-white/20 transition"
              >
                {chain}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Download CTA */}
      <section id="download" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <h2 className="text-4xl font-bold mb-8">Download T@gged Today</h2>
        <p className="text-xl text-gray-300 mb-12">Available on iOS and Android</p>
        <div className="flex gap-4 justify-center flex-wrap">
          <a
            href="https://apps.apple.com/app/tagged"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 bg-black border-2 border-white rounded-lg hover:bg-white hover:text-black transition font-semibold"
          >
            <span>🍎</span>
            Download on App Store
          </a>
          <a
            href="https://play.google.com/store/apps/details?id=com.tagged"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-8 py-4 bg-green-600 hover:bg-green-700 rounded-lg transition font-semibold"
          >
            <span>🤖</span>
            Get it on Google Play
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black/50 border-t border-white/10 py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center text-gray-400">
          <p>&copy; 2026 T@gged. All rights reserved.</p>
          <div className="flex justify-center gap-6 mt-4">
            <a href="/terms" className="hover:text-white transition">
              Terms
            </a>
            <a href="/privacy" className="hover:text-white transition">
              Privacy
            </a>
            <a href="https://twitter.com/tagged" className="hover:text-white transition">
              Twitter
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
