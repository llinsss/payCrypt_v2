export interface AccountResponse {
    success: boolean;
    data?: {
        tag: string;
        publicKey: string;
        secretKey: string;
        balance: string;
    };
    error?: string;
}
