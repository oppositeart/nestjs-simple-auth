import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterUserDto } from './dto/register-user.dto.js';
import { Prisma } from '../generated/prisma/client.js';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from './interfaces/jwt.interface.js';
import ms, { type StringValue } from 'ms';
import { LoginUserDto } from './dto/login-user.dto.js';
import { hash, verify } from 'argon2';
import type { Response, Request } from 'express';
import { isDev } from '../utils/is-dev.util.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';

// Hash of a random value nobody knows; verified against when the email is
// unknown so a failed login takes the same time whether or not the user exists.
const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$bqFCf62v/SkWUuqy2ix5WA$pkAaTh5NMvIpm4ISE/sjVZaLDMoYcrzmzMza6eBzT7E';

@Injectable()
export class AuthService {
  private readonly JWT_ACCESS_TTL: StringValue;
  private readonly JWT_REFRESH_TTL: StringValue;
  private readonly JWT_REFRESH_SECRET: string;

  private readonly COOKIE_DOMAIN: string;

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {
    this.JWT_ACCESS_TTL =
      configService.getOrThrow<StringValue>('JWT_ACCESS_TTL');
    this.JWT_REFRESH_TTL =
      configService.getOrThrow<StringValue>('JWT_REFRESH_TTL');
    this.JWT_REFRESH_SECRET =
      configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    this.COOKIE_DOMAIN = configService.getOrThrow<string>('COOKIE_DOMAIN');
  }

  async register(
    dto: RegisterUserDto,
    res: Response,
  ): Promise<AuthResponseDto> {
    const { name, email, password } = dto;

    const existedUser = await this.prismaService.user.findUnique({
      where: {
        email,
      },
    });

    if (existedUser) {
      throw new ConflictException('User with this email already exists');
    }

    try {
      const newUser = await this.prismaService.user.create({
        data: {
          name,
          email,
          password: await hash(password),
        },
      });

      return this.auth(newUser.id, res);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('User with this email already exists');
      }

      throw error;
    }
  }

  async login(dto: LoginUserDto, res: Response): Promise<AuthResponseDto> {
    const { email, password } = dto;

    const user = await this.prismaService.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
        password: true,
      },
    });

    const isValidPassword = await verify(
      user?.password ?? DUMMY_PASSWORD_HASH,
      password,
    );

    if (!user || !isValidPassword) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.auth(user.id, res);
  }

  async refresh(req: Request, res: Response): Promise<AuthResponseDto> {
    const refreshToken = req.cookies['refreshToken'];

    if (!refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    let payload: JwtPayload;

    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!payload.id) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prismaService.user.findUnique({
      where: {
        id: payload.id,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.auth(user.id, res);
  }

  async logout(res: Response): Promise<boolean> {
    this.setCookie(res, '', 0);

    return true;
  }

  async validate(id: string) {
    const user = await this.prismaService.user.findUnique({
      where: {
        id,
      },
    });

    if (!user?.id) {
      throw new UnauthorizedException('Invalid access token');
    }

    return user;
  }

  private auth(id: string, res: Response) {
    const { accessToken, refreshToken } = this.generateTokens(id);

    this.setCookie(res, refreshToken, ms(this.JWT_REFRESH_TTL));

    return { accessToken };
  }

  private generateTokens(id: string) {
    const payload: JwtPayload = { id };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.JWT_ACCESS_TTL,
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.JWT_REFRESH_SECRET,
      expiresIn: this.JWT_REFRESH_TTL,
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  private setCookie(res: Response, value: string, maxAge: number) {
    res.cookie('refreshToken', value, {
      httpOnly: true,
      domain: this.COOKIE_DOMAIN,
      maxAge,
      secure: !isDev(this.configService),
      sameSite: 'lax',
    });
  }
}
