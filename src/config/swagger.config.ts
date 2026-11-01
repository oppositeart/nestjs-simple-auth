import { DocumentBuilder } from '@nestjs/swagger';

export function getSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('Nest JS study project')
    .setDescription('API documentation for Nest JS')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
}
