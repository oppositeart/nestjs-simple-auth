import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from '../guards/auth.guard.js';

export function Authorization() {
  return applyDecorators(UseGuards(JwtGuard), ApiBearerAuth());
}
