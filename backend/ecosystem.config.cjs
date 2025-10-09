module.exports = {
  apps: [
    {
      name: "api-server",
      script: "./server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "balance-worker",
      script: "./workers/balance-worker.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
    {
      name: "bull-board",
      script: "./dashboard.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        DASHBOARD_PORT: 3001,
      },
    },
  ],
};
