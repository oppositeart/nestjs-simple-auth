import { AuthGuard } from '@nestjs/passport';

/** Authentication guard. */
export class JwtGuard extends AuthGuard('jwt-strategy') {}
