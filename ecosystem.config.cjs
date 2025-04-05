module.exports = {
  apps: [
    {
      name: 'CountBot',
      script: './app.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      },
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '1m'
    }
  ]
};
