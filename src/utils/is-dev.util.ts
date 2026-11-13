import { ConfigService } from '@nestjs/config';

/**
 * Helper to check for the DEV environment.
 * @param configService To get environment variables
 * @returns `true` if environment is development, otherwise `false`.
 */
export function isDev(configService: ConfigService) {
  return configService.getOrThrow<string>('NODE_ENV') === 'development';
}
