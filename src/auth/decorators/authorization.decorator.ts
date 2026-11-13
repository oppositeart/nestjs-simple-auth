import { applyDecorators, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { JwtGuard } from '../guards/jwt.guard.js';

/**
 * Decorator to combine AuthGuard with Swagger authentication mark.
 * @returns Decorator
 */
export function Authorization() {
  return applyDecorators(UseGuards(JwtGuard), ApiBearerAuth());
}
