module.exports = {
  apps: [
    {
      name: 'line-api',
      script: '/root/line-api/dist/src/main.js',
      cwd: '/root/line-api',
      instances: 1,
      exec_mode: 'fork',
      node_args: '--max-old-space-size=400',
      autorestart: true,
      watch: false,
      max_memory_restart: '450M',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3002,
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/line_sender',
        APP_URL: 'https://sales.beautyup-enterprise.com',
        JWT_SECRET: 'your_jwt_secret_change_this',
        GOOGLE_DRIVE_FOLDER_ID: '1qIERO7DmCnYOG1hpNsDYzHpYDE04gSD0',
        // LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET, GOOGLE_CREDENTIALS, GOOGLE_SHEET_ID → set in .env on server
      },
    },
  ],
};
