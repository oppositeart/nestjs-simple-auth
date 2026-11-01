import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../dist/app.module.js';
import { getSwaggerConfig } from '../dist/config/swagger.config.js';

const app = await NestFactory.create(AppModule, { logger: ['error'] });
const document = SwaggerModule.createDocument(app, getSwaggerConfig());

const outputPath = new URL('../docs/openapi.json', import.meta.url);
await writeFile(outputPath, `${JSON.stringify(document, null, 2)}\n`);
await app.close();

console.log('OpenAPI spec written to docs/openapi.json');
