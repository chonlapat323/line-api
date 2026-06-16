module.exports = {
  apps: [
    {
      name: 'line-api',
      script: '/root/line-api/dist/src/main.js',
      cwd: '/root/line-api',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/line_sender',
        APP_URL: 'https://sales.beautyup-enterprise.com',
        JWT_SECRET: 'your_jwt_secret_change_this',
        // LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET → set in .env on server
      },
    },
  ],
};
