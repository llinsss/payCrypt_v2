// CHANGE: Updated to support both testnet and mainnet configurations dynamically based on environment
export const stellarConfig = {
    testnet: {
        networkPassphrase: 'Test SDF Network ; September 2015',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        friendbotUrl: 'https://friendbot.stellar.org',
        networkType: 'testnet',
    },
    mainnet: {
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
        horizonUrl: 'https://horizon.stellar.org',
        friendbotUrl: null, // Friendbot is not available on mainnet
        networkType: 'mainnet',
    },
};

/**
 * Gets the Stellar configuration based on the network type
 * CHANGE: New function to provide dynamic network selection
 */
export const getStellarConfig = (network: 'testnet' | 'mainnet' = 'testnet') => {
    return stellarConfig[network];
};
