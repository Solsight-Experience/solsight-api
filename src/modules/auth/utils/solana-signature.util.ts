import { UnauthorizedException } from "@nestjs/common";
import bs58 from "bs58";
import * as nacl from "tweetnacl";

export function resolveSolanaSignedBytes(walletNonce: string, signedMessage?: string): Uint8Array {
    if (!signedMessage) {
        return new TextEncoder().encode(walletNonce);
    }

    if (!signedMessage.includes(walletNonce)) {
        throw new UnauthorizedException("Signature message does not match wallet nonce");
    }

    return new TextEncoder().encode(signedMessage);
}

export function verifySolanaSignature(walletAddress: string, signature: string, walletNonce: string, signedMessage?: string): void {
    try {
        const signatureUint8 = bs58.decode(signature);
        const signedBytes = resolveSolanaSignedBytes(walletNonce, signedMessage);
        const publicKeyUint8 = bs58.decode(walletAddress);

        const verified = nacl.sign.detached.verify(signedBytes, signatureUint8, publicKeyUint8);

        if (!verified) {
            throw new UnauthorizedException("Invalid signature");
        }
    } catch {
        throw new UnauthorizedException("Signature verification failed");
    }
}
