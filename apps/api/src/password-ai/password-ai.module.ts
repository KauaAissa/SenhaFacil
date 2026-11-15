import { Module } from '@nestjs/common';
import { PasswordAiController } from './password-ai.controller';
import { PasswordAiService } from './password-ai.service';

@Module({ controllers: [PasswordAiController], providers: [PasswordAiService] })
export class PasswordAiModule {}
