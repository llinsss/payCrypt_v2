/**
 * Utility to generate blockchain explorer links for transactions
 */

const EXPLORER_CONFIG = {
    Starknet: 'https://starkscan.co/tx/',
    Lisk: 'https://blockscout.lisk.com/tx/',
    Base: 'https://basescan.org/tx/',
    Flow: 'https://flowscan.org/transaction/',
    U2U: 'https://u2uscan.xyz/tx/',
    Stellar: 'https://stellar.expert/explorer/public/tx/'
};

/**
 * Generates an explorer link for a transaction
 * @param {string} chainName - The name of the blockchain
 * @param {string} txHash - The transaction hash
 * @param {string} baseUrl - Optional base URL from the database
 * @returns {string|null} The explorer link or null if hash is missing
 */
export const getExplorerLink = (chainName, txHash, baseUrl = null) => {
    if (!txHash) return null;

    // Fallback to baseUrl if provided (prioritized as it comes from DB)
    if (baseUrl) {
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

        // Most explorers use /tx/ for transactions
        if (chainName === 'Flow') {
            return `${cleanBaseUrl}transaction/${txHash}`;
        }

        return `${cleanBaseUrl}tx/${txHash}`;
    }

    // Use config mapping if available
    if (EXPLORER_CONFIG[chainName]) {
        return `${EXPLORER_CONFIG[chainName]}${txHash}`;
    }

    return null;
};

export default {
    getExplorerLink
};
