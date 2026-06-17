module.exports = {
  apps: [
    {
      name: 'line-api',
      script: '/root/line-api/dist/src/main.js',
      cwd: '/root/line-api',
      instances: 1,
      exec_mode: 'cluster',
      node_args: '--max-old-space-size=400',
      autorestart: true,
      watch: false,
      max_memory_restart: '450M',
    },
  ],
};
