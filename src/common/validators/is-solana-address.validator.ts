import { registerDecorator, ValidationOptions, ValidationArguments } from "class-validator";
import { PublicKey } from "@solana/web3.js";

/**
 * Validates that a string is a valid Solana address (base58-encoded public key).
 *
 * @param onCurveOnly - If true, also checks that the address is on the Ed25519 curve
 * @param validationOptions - Standard class-validator options
 *
 * Example:
 *   @IsSolanaAddress()
 *   walletAddress: string;
 *
 *   @IsSolanaAddress(true)  // enforce on-curve only
 *   signer: string;
 */
export function IsSolanaAddress(onCurveOnly = false, validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: "isSolanaAddress",
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value: any) {
                    try {
                        // Must be a string
                        if (typeof value !== "string") return false;

                        // Must match Solana base58 address format (32-44 chars, valid base58 alphabet)
                        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return false;

                        // Parse as PublicKey (validates decoding and checksum)
                        const pubKey = new PublicKey(value);

                        // Optionally enforce on-curve check (rejects PDAs and other off-curve keys)
                        if (onCurveOnly) {
                            return PublicKey.isOnCurve(pubKey.toBuffer());
                        }

                        return true;
                    } catch {
                        return false;
                    }
                },

                defaultMessage(args: ValidationArguments) {
                    const onCurveMsg = onCurveOnly ? " (on-curve only)" : "";
                    return `${args.property} must be a valid Solana address${onCurveMsg}`;
                }
            }
        });
    };
}
