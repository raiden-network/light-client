const sidebar = require('./api-sidebar');

module.exports = {
    title: 'Raiden Light Client SDK',
    description: 'API Documentation for the Raiden Light Client SDK',
    base: '/docs/',
    themeConfig: {
        repo: 'raiden-network/light-client',
        displayAllHeaders: true,
        sidebar: sidebar,
        lastUpdated: 'Last Updated',
        nav: [
            { text: 'Raiden Network', link: 'https://raiden.network/' },
            { text: 'Developer Portal', link: 'https://developer.raiden.network/' }
        ]
    }
};
