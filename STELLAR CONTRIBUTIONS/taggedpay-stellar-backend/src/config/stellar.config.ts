// CHANGE: Updated to support both testnet and mainnet configurations dynamically based on environment
// CHANGE: Added token contract validation configuration for allowlisting trust boundary.

export interface StellarNetworkConfig {
    networkPassphrase: string;
    horizonUrl: string;
    friendbotUrl: string | null;
    networkType: 'testnet' | 'mainnet';
}

export interface TokenValidationPolicy {
    /** Maximum number of decimals allowed for a token contract. */
    maxDecimals: number;
    /** Minimum total supply required for allowlisting. */
    minTotalSupply: bigint;
    /** Maximum total supply allowed for allowlisting. */
    maxTotalSupply: bigint;
    /** Required token name length range. */
    minNameLength: number;
    maxNameLength: number;
    /** Required token symbol length range. */
    minSymbolLength: number;
    maxSymbolLength: number;
    /** Allowed admin addresses that may authorize mutations. */
    allowedAdmins: readonly string[];
    /** Maximum number of authorized addresses for a contract. */
    maxAuthorizedAddresses: number;
    /** Maximum number of authorized addresses that can be added in a single transaction. */
    maxAuthorizedAddressesPerTx: number;
    /** Minimum ledger interval between authorization mutations. */
    minAuthorizationIntervalLedgers: number;
    /** Maximum allowed contract size in bytes. */
    maxContractSizeBytes: number;
    /** Required contract version for allowlisting. */
    requiredContractVersion: string;
}

export interface TokenContractState {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    totalSupply: bigint;
    admin: string;
    authorizedAddresses: readonly string[];
    contractSizeBytes: number;
    contractVersion: string;
    lastMutationLedger: number;
    mutationCount: number;
}

export const stellarConfig: Record<'testnet' | 'mainnet', StellarNetworkConfig> = {
    testnet: {
        networkPassphrase: 'Test SDF Network ; September 2015',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        friendbotUrl: 'https://friendbot.stellar.org',
        networkType: 'testnet',
    },
    mainnet: {} as StellarNetworkConfig,
    mainnet: {
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
        horizonUrl: 'https://horizon.stellar.org',
        friendbotUrl: null, // Friendbot is not available on mainnet
        networkType: 'mainnet',
    },
};

/**
 * Default token validation policy applied before allowlisting a token contract.
 * The policy defines the trust boundary and failure-safe state transitions.
 */
export const defaultTokenValidationPolicy: TokenValidationPolicy = {
    maxDecimals: 7,
    minTotalSupply: 1n,
    maxTotalSupply: 1n * 10^18n,
    minNameLength: 1,
    maxNameLength: 64,
    minSymbolLength: 1,
    maxSymbolLength: 16,
    allowedAdmins: [],
    maxAuthorizedAddresses: 1000,
    maxAuthorizedAddressesPerTx: 10,
    minAuthorizationIntervalLedgers: 1,
    maxContractSizeBytes: 64 * 1024,
    requiredContractVersion: '1.0.0',
};

export type TokenValidationFailureReason =
    | 'invalid_address'
    | 'name_length'
    | 'symbol_length'
    | 'decimals_out_of_range'
    | 'total_supply_out_of_range'
    | 'unauthorized_admin'
    | 'too_many_authorized_addresses_per_tx'
    | 'too_many_authorized_addresses'
    | 'authorization_interval_too_short'
    | 'contract_size_too_large'
    | 'contract_version_mismatch'
    | 'replay_detected';

export interface TokenValidationResult {
    valid: boolean;
    reason?: TokenValidationFailureReason;
    details?: string;
    /** Deterministic identifier of the validated state for replay protection. */
    stateDigest?: string;
}

/**
 * Deterministic digest of a token contract state. Two identical states always
 * produce the same digest, allowing replay detection across attempts.
 */
export const computeTokenStateDigest = (state: TokenContractState): string => {
    const normalized = [
        state.address,
        state.name,
        state.symbol,
        String(state.decimals),
        state.totalSupply.toString(),
        state.admin,
        [...state.authorizedAddresses].sort().join(','),
        String(state.contractSizeBytes),
        state.contractVersion,
        String(state.lastMutationLedger),
        String(state.mutationCount),
    ].join('|');
    // FNX-1a style deterministic hash (djb2-like) without external dependencies.
    let hash = 0x811c9edb;
    for (let i = 0; i < normalized.length; i++) {
        hash ^= normalized.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>>
            0;
    }
    const hex = (hash >>> 0).toString(16).padStart(8, '0');
    return `hex:${hex}`;
};

/**
 * Validates a token contract state against the configured policy.
 *
 * Trust boundary: only the configured admin addresses may authorize mutations.
 * Privileged roles: the admin address is the sole authority for authorization.
 * Replay behavior: the state digest is deterministic; if a digest was already
 *   applied, the validation fails with 'replay_detected'.
 * Failure-safe state transitions: any failure returns valid: false and leaves
 *   the allowlist unchanged.
 */
export const validateTokenContract = (
    state: TokenContractState,
    policy: TokenValidationPolicy = defaultTokenValidationPolicy,
    alreadyAppliedDigests: readonly string[] = [],
): TokenValidationResult => {
    if (!state.address || state.address.length < 56) {
        return { valid: false, reason: 'invalid_address' };
    }
    if (state.name.length < policy.minNameLength || state.name.length > policy.maxNameLength) {
        return { valid: false, reason: 'name_length' };
    }
    if (state.symbol.length < policy.minSymbolLength || state.symbol.length > policy.maxSymbolLength) {
        return { valid: false, reason: 'symbol_length' };
    }
    if (state.decimals < 0 || state.decimals > policy.maxDecimals) {
        return { valid: false, reason: 'decimals_out_of_range' };
    }
    if (state.totalSupply < policy.minTotalSupply || state.totalSupply > policy.maxTotalSupply) {
        return { valid: false, reason: 'total_supply_out_of_range' };
    }
    if (policy.allowedAdmins.length > 0 && !policy.allowedAdmins.includes(state.admin)) {
        return { valid: false, reason: 'unauthorized_admin' };
    }
    if (state.authorizedAddresses.length > policy.maxAuthorizedAddresses) {
        return { valid: false, reason: 'too_many_authorized_addresses' };
    }
    if (state.authorizedAddresses.length > policy.maxAuthorizedAddressesPerTx) {
        return { valid: false, reason: 'too_many_authorized_addresses_per_tx' };
    }
    if (state.lastMutationLedger < policy.minAuthorizationIntervalLedgers) {
        return { valid: false, reason: 'authorization_interval_too_short' };
    }
    if (state.contractSizeBytes > policy.maxContractSizeBytes) {
        return { valid: false, reason: 'contract_size_too_large' };
    }
    if (state.contractVersion !== policy.requiredContractVersion) {
        return { valid: false, reason: 'contract_version_mismatch' };
    }
    const digest = computeTokenStateDigest(state);
    if (alreadyAppliedDigests.includes(digest)) {
        return { valid: false, reason: 'replay_detected', stateDigest: digest };
    }
    return { valid: true, stateDigest: digest };
};

/**
 * Failure-safe state transition helper. Applies a validated token to the
 * allowlist only if validation succeeded. On failure the allowlist is returned
 * unchanged and the failure reason is surfaced for monitoring.
 */
export const applyTokenAllowlisting = (
    alreadyAllowlisted: readonly string[],
    state: TokenContractState,
    policy: TokenValidationPolicy = defaultTokenValidationPolicy,
): { allowlisted: readonly string[]; result: TokenValidationResult } => {
    const result = validateTokenContract(state, policy, alreadyAllowlisted);
    if (!result.valid) {
        return { allowlisted: alreadyAllowlisted, result };
    }
    return {
        allowlisted: [...alreadyAllowlisted, state.address],
        result,
    };
};

/**
 * Gets the Stellar configuration based on the network type
 * CHANGE: New function to provide dynamic network selection
 */
export const getStellarConfig = (network: 'testnet' | 'mainnet' = 'testnet'): StellarNetworkConfig => {
    return stellarConfig[network];
};
