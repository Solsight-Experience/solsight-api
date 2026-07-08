import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";
import { QuotaService } from "../services/quota.service";

@Controller("billing")
@UseGuards(JwtAuthGuard)
export class QuotaController {
    constructor(private readonly quotaService: QuotaService) {}

    @Get("quota")
    async getQuota(@CurrentUser() user: CurrentUserPayload) {
        return this.quotaService.getQuotaStatus(user.id);
    }
}
