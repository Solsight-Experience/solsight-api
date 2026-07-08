import { ForbiddenException } from "@nestjs/common";

export class QuotaExceededException extends ForbiddenException {
    constructor() {
        super({
            message: "Daily quota exceeded",
            error: "QuotaExceeded",
            canPurchase: true
        });
    }
}
