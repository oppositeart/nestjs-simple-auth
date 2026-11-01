import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, Length } from 'class-validator';

export class RegisterUserDto {
  @ApiProperty({
    description: 'Displayed user name',
    example: 'admin',
    minLength: 3,
    maxLength: 32,
  })
  @IsString()
  @Length(3, 32)
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'User email', example: 'admin@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'qwerty123',
    minLength: 8,
    maxLength: 32,
  })
  @IsString()
  @Length(8, 32)
  password: string;
}
