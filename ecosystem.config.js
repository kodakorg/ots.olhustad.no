module.exports = {
    apps: [{
        name: 'ots.olhustad',
        script: 'npm',
        args: 'run start',
        cwd: '/home/zom/www/ots.olhustad.no',
        env: {
            NODE_ENV: 'production',
            PORT: 3006
        },
        max_memory_restart: '512M',
        restart_delay: 10000,
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s'
    }]
};