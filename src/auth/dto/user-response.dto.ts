import { ApiProperty } from '@nestjs/swagger';

export class UserResponseDto {
  @ApiProperty({
    description: 'User ID',
    example: '3f1c2b7e-8a4d-4f6b-9c2e-1d5a7b9e0f12',
    format: 'uuid',
  })
  id: string;

  @ApiProperty({ description: 'Displayed user name', example: 'admin' })
  name: string;

  @ApiProperty({ description: 'User email', example: 'admin@gmail.com' })
  email: string;

  @ApiProperty({
    description: 'Account creation date',
    example: '2026-11-01T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Last account update date',
    example: '2026-11-01T12:00:00.000Z',
  })
  updatedAt: Date;
}
