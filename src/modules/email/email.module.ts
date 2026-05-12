import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EmailSubscription } from "./entities/email-subscription.entity";
import { EmailApiService } from "./services/email-api.service";
import { EmailSubscriptionService } from "./services/email-subscription.service";
import { EmailSenderService } from "./services/sender-service";
import { EmailController } from "./controllers/email.controller";

@Module({
    imports: [TypeOrmModule.forFeature([EmailSubscription]), ConfigModule],
    providers: [EmailSenderService, EmailApiService, EmailSubscriptionService],
    controllers: [EmailController],
    exports: [EmailSubscriptionService, EmailSenderService]
})
export class EmailModule {}
