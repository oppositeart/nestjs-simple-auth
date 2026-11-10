import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from '../guards/jwt.guard.js';

export function Authorization() {
  return applyDecorators(UseGuards(JwtGuard), ApiBearerAuth());
}
