const apiSidebar = require('./api-sidebar');

module.exports = {
    title: 'Raiden Light Client SDK',
    description: 'API Documentation for the Raiden Light Client SDK',
    base: '/docs/',
    themeConfig: {
        repo: 'raiden-network/light-client',
        lastUpdated: 'Last Updated',
        nav: [
            { text: 'Docs', link: '/prerequisites/' },
            { text: 'Raiden Network', link: 'https://raiden.network' },
            { text: 'Developer Portal', link: 'https://developer.raiden.network' }
        ],
        sidebar: [
            {
                title: 'Get Started',
                collapsable: false,
                sidebarDepth: 0,
                children: [
                    '/prerequisites/',
                    '/installing-sdk/',
                    '/installing-dapp/',
                    '/connecting/'
                ]
            },
            {
                title: 'Usage',
                collapsable: false,
                sidebarDepth: 0,
                children: [
                    '/opening-channel/',
                    '/funding-channel/',
                    '/direct-transfer/',
                    '/closing-channel/',
                    '/settling-channel/'
                ]
            },
            {
                title: 'API',
                collapsable: false,
                sidebarDepth: 0,
                children: apiSidebar
            }
        ]
    }
};
