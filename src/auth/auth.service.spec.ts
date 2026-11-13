import { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { Test, TestingModule } from '@nestjs/testing';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../generated/prisma/client.js';
import { RegisterUserDto } from './dto/register-user.dto.js';
import { Request, Response } from 'express';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { getJwtConfig } from '../config/jwt.config.js';
import { ConfigService } from '@nestjs/config';
import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import ms, { StringValue } from 'ms';
import { LoginUserDto } from './dto/login-user.dto.js';
import { hash } from 'argon2';

const ACCESS_TOKEN_SECRET_KEY = 'access-token-secret-key';
const REFRESH_TOKEN_SECRET_KEY = 'refresh-token-secret-key';
const REFRESH_TOKEN = 'refresh-token';

const config: Record<string | symbol, unknown> = {
  JWT_ACCESS_TTL: '30m',
  JWT_REFRESH_TTL: '7d',
  JWT_REFRESH_SECRET: REFRESH_TOKEN_SECRET_KEY,
  COOKIE_DOMAIN: 'localhost',
};

const userId = uuidv4();
const userPassword = '12345678';
const userPasswordHash = await hash(userPassword);

const user: User = {
  id: userId,
  name: 'User',
  email: 'user@gmail.com',
  password: userPasswordHash,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const registeringUserData: RegisterUserDto = {
  name: user.name,
  email: user.email,
  password: userPassword,
};

const loginUserData: LoginUserDto = {
  email: user.email,
  password: userPassword,
};

const cookieSettings = {
  httpOnly: true,
  domain: config.COOKIE_DOMAIN,
  maxAge: ms(config.JWT_REFRESH_TTL as StringValue),
  sameSite: 'lax',
};

describe('Auth Service', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  let res: Response;

  const db = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  };

  beforeEach(async () => {
    // Mock user values to override changes in db before each test
    db.user.findUnique.mockResolvedValue(user);
    db.user.create.mockResolvedValue(user);

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register(
          await getJwtConfig({
            getOrThrow: () => ACCESS_TOKEN_SECRET_KEY,
          } as unknown as ConfigService),
        ),
      ],
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: db,
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: vi.fn((key: string) => config[key]),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);

    res = { cookie: vi.fn().mockReturnThis() } as unknown as Response;
  });

  afterEach(() => {
    vi.clearAllMocks(); // Reset call history
    vi.restoreAllMocks(); // Returns original jwtService.sign after spyOn
  });

  it('Service should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Register', () => {
    it('Should return correct access token for the new unique user', async () => {
      db.user.findUnique.mockResolvedValue(null);

      const { accessToken } = await service.register(registeringUserData, res);

      expect(accessToken).toBeDefined();

      // Check payload can be verified with access token secret.
      const payload = await jwtService.verifyAsync(accessToken);
      expect(payload.id).toBe(user.id);

      // Check payload can't be verified with refresh token secret.
      await expect(
        jwtService.verifyAsync(accessToken, {
          secret: REFRESH_TOKEN_SECRET_KEY,
        }),
      ).rejects.toThrow();
    });

    it('Should return ConflictException for the user with same email', async () => {
      db.user.findUnique.mockResolvedValue(user);

      await expect(service.register(registeringUserData, res)).rejects.toThrow(
        ConflictException,
      );
    });

    it('Should write refresh token to cookies', async () => {
      db.user.findUnique.mockResolvedValue(null);

      // Mock refresh token to check it in cookies.
      vi.spyOn(jwtService, 'sign').mockImplementation(() => REFRESH_TOKEN);

      await service.register(registeringUserData, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        REFRESH_TOKEN,
        expect.objectContaining(cookieSettings),
      );
    });
  });

  describe('Login', () => {
    it('Should return correct access token', async () => {
      const { accessToken } = await service.login(loginUserData, res);

      // Check payload has correct user id
      const payload = await jwtService.verifyAsync(accessToken);
      expect(payload.id).toBe(user.id);
    });

    it('Should write refresh token to cookies', async () => {
      // Mock refresh token to check it in cookies.
      vi.spyOn(jwtService, 'sign').mockImplementation(() => REFRESH_TOKEN);

      await service.login(loginUserData, res);

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        REFRESH_TOKEN,
        expect.objectContaining(cookieSettings),
      );
    });

    it('Should return UnauthorizedException if user not found or password is invalid', async () => {
      const wrongLoginUserData = { ...loginUserData, password: 'qwertyuio' };

      await expect(service.login(wrongLoginUserData, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('Refresh', () => {
    const createRequest = (refreshToken?: string) =>
      ({
        cookies: refreshToken ? { refreshToken } : {},
      }) as unknown as Request;

    const signRefreshToken = () =>
      jwtService.sign(
        { id: user.id },
        {
          secret: REFRESH_TOKEN_SECRET_KEY,
          expiresIn: config.JWT_REFRESH_TTL as StringValue,
        },
      );

    it('Should return correct access token for valid refresh token', async () => {
      const req = createRequest(signRefreshToken());

      const { accessToken } = await service.refresh(req, res);

      const payload = await jwtService.verifyAsync(accessToken);
      expect(payload.id).toBe(user.id);
    });

    it('Should throw UnauthorizedException if refresh token is missing', async () => {
      const req = createRequest();

      await expect(service.refresh(req, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('Should throw UnauthorizedException if token is not signed with refresh secret', async () => {
      // Access token must not be accepted as a refresh token.
      const req = createRequest(jwtService.sign({ id: user.id }));

      await expect(service.refresh(req, res)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('Should throw NotFoundException if user does not exist', async () => {
      db.user.findUnique.mockResolvedValue(null);
      const req = createRequest(signRefreshToken());

      await expect(service.refresh(req, res)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('Logout', () => {
    it('Should return true for success logout', async () => {
      const result = await service.logout(res);

      expect(result).toEqual(true);
    });

    it('Should reset the refresh token in cookies', async () => {
      await service.logout(res);

      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        '',
        expect.objectContaining({ ...cookieSettings, maxAge: 0 }),
      );
    });
  });
});
