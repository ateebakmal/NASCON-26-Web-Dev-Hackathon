import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";

import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./queue/redis.module";
import { EscalationQueueModule } from "./queue/escalation.queue";
import { RealtimeModule } from "./modules/realtime/realtime.module";
import { AuditModule } from "./modules/audit/audit.module";
import { PermissionsModule } from "./modules/permissions/permissions.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { EmployeeStatusModule } from "./modules/employee-status/employee-status.module";
import { AssignmentEngineModule } from "./modules/assignment-engine/assignment-engine.module";
import { LeadsModule } from "./modules/leads/leads.module";
import { CrmModule } from "./modules/crm/crm.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { PaymentsModule } from "./modules/payments/payments.module";

import { SessionAuthGuard } from "./common/guards/session-auth.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { FieldMaskInterceptor } from "./common/interceptors/field-mask.interceptor";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    EscalationQueueModule,
    RealtimeModule,
    AuditModule,
    PermissionsModule,
    AuthModule,
    UsersModule,
    EmployeeStatusModule,
    AssignmentEngineModule,
    LeadsModule,
    CrmModule,
    DashboardModule,
    MessagingModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [
    // Order matters: SessionAuthGuard runs first (establishes req.userId /
    // req.workspaceId from the session cookie), then PermissionsGuard (reads
    // those fields to authorize). Both fail closed by default.
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // Field-level masking runs on every response that declares @MaskFields,
    // so a restricted user never receives a value they may not see -- not
    // even by calling the API directly (F1.4, F1.5).
    { provide: APP_INTERCEPTOR, useClass: FieldMaskInterceptor },
  ],
})
export class AppModule {}
