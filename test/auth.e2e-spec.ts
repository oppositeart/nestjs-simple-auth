import { HttpStatus, INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Server } from 'node:http';
import { AppModule } from '../src/app.module.js';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import cookieParser from 'cookie-parser';
import type { RegisterUserDto } from '../src/auth/dto/register-user.dto.js';
import { LoginUserDto } from '../src/auth/dto/login-user.dto.js';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import setCookieParser from 'set-cookie-parser';

const invalidTypes = {
  number: 123456789,
  object: { name: 'user name' },
  boolean: true,
  empty: null,
  undefined: undefined,
};

const registerUserData: RegisterUserDto = {
  name: 'Test User',
  email: 'testuser@gmail.com',
  password: '12345678',
};

const loginUserData: LoginUserDto = {
  email: registerUserData.email,
  password: registerUserData.password,
};

const invalidUserNames = {
  ...invalidTypes,
  short: 'ab',
  long: 'abcdefghijklmnlopqrstuvwxyzabcdefghijklmnlopqrstuvwxyz',
};

const invalidUserEmails = {
  ...invalidTypes,
  noAtSymbol: 'testusergmail.com',
  noDomain: 'testuser@gmail',
  string: 'testuser',
};

const invalidUserPasswords = {
  ...invalidTypes,
  short: '123',
  long: '123456789012345678901234567890123',
};

describe('AuthController (e2e)', () => {
  let app: INestApplication<Server>;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  let refreshJwtSecret: string;

  let httpServer: Server;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();

    app.use(cookieParser());

    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.init();

    httpServer = app.getHttpServer();

    prismaService = app.get(PrismaService);
    jwtService = app.get(JwtService);

    const configService = app.get(ConfigService);
    refreshJwtSecret = configService.getOrThrow('JWT_REFRESH_SECRET');

    // Clear db before running tests
    await prismaService.user.deleteMany();
  });

  afterAll(async () => {
    // Clear db after running tests
    await prismaService.user.deleteMany();
    // Kill the app
    await app.close();
  });

  describe('/auth', () => {
    describe('[POST] /register', () => {
      let accessToken: string;
      let refreshToken: string;

      it('Should create a user using valid data', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send(registerUserData)
          .expect(HttpStatus.CREATED);

        const cookies = response.get('set-cookie') ?? [];

        // Setup access and refresh tokens
        accessToken = response.body.accessToken ?? '';
        refreshToken =
          setCookieParser(cookies, { map: true }).refreshToken.value ?? '';
      });

      it('Should have valid access and refresh tokens', async () => {
        const accessTokenPayload = await jwtService.verifyAsync(accessToken);
        const refreshTokenPayload = await jwtService.verifyAsync(refreshToken, {
          secret: refreshJwtSecret,
        });

        expect(accessTokenPayload.id).toEqual(expect.any(String));
        expect(refreshTokenPayload.id).toEqual(expect.any(String));
      });

      it('Should not validate access token as a refresh token', async () => {
        await expect(
          jwtService.verifyAsync(accessToken, {
            secret: refreshJwtSecret,
          }),
        ).rejects.toThrow();
      });

      it('Should return a conflict if user with the same email is exist', async () => {
        await request(app.getHttpServer())
          .post('/auth/register')
          .send(registerUserData)
          .expect(HttpStatus.CONFLICT);

        // Clear db
        await prismaService.user.deleteMany();
      });

      describe('Should return 400 for invalid names', () => {
        // Create test for each case of invalid user name
        it.each(Object.entries(invalidUserNames))(
          '(%s)',
          async (name, value) => {
            await request(app.getHttpServer())
              .post('/auth/register')
              .send({ ...registerUserData, name: value })
              .expect(HttpStatus.BAD_REQUEST);
          },
        );
      });

      describe('Should return 400 for invalid emails', () => {
        // Create test for each case of invalid user email
        it.each(Object.entries(invalidUserEmails))(
          '(%s)',
          async (name, value) => {
            await request(app.getHttpServer())
              .post('/auth/register')
              .send({ ...registerUserData, email: value })
              .expect(HttpStatus.BAD_REQUEST);
          },
        );
      });

      describe('Should return 400 for invalid passwords', () => {
        // Create test for each case of invalid user password
        it.each(Object.entries(invalidUserPasswords))(
          '(%s)',
          async (name, value) => {
            await request(app.getHttpServer())
              .post('/auth/register')
              .send({ ...registerUserData, password: value })
              .expect(HttpStatus.BAD_REQUEST);
          },
        );
      });
    });

    describe('[POST] /login', () => {
      let accessToken: string;
      let refreshToken: string;
      let userId: string;

      // Create test user before all tests
      beforeAll(async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send(registerUserData);

        const payload = await jwtService.verifyAsync(response.body.accessToken);
        userId = payload.id;
      });
      // Clear db after all test
      afterAll(async () => {
        await prismaService.user.deleteMany();
      });

      it('Should login with correct credentials and return access/refresh tokens', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/login')
          .send(loginUserData)
          .expect(HttpStatus.OK);

        const cookies = response.get('Set-Cookie') ?? [];

        accessToken = response.body.accessToken ?? '';
        refreshToken =
          setCookieParser(cookies, { map: true }).refreshToken.value ?? '';
      });

      it('Should have valid access and refresh tokens', async () => {
        const accessTokenPayload = await jwtService.verifyAsync(accessToken);
        const refreshTokenPayload = await jwtService.verifyAsync(refreshToken, {
          secret: refreshJwtSecret,
        });

        expect(accessTokenPayload.id).toBe(userId);
        expect(refreshTokenPayload.id).toBe(userId);
      });

      it('Should not validate access token with refresh token secret', async () => {
        await expect(
          jwtService.verifyAsync(accessToken, {
            secret: refreshJwtSecret,
          }),
        ).rejects.toThrow();
      });

      it('Should throw an error for the incorrect email', async () => {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({ ...loginUserData, email: 'invalid' + loginUserData.email })
          .expect(HttpStatus.BAD_REQUEST);
      });

      it('Should throw an error for the incorrect password', async () => {
        await request(app.getHttpServer())
          .post('/auth/login')
          .send({
            ...loginUserData,
            password: 'invalid' + loginUserData.password,
          })
          .expect(HttpStatus.BAD_REQUEST);
      });
    });

    describe('[POST] /refresh', () => {
      let accessToken: string;
      let refreshToken: string;
      let userId: string;

      // Create test user before all tests
      beforeAll(async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send(registerUserData);

        const cookies = response.get('Set-Cookie') ?? [];

        accessToken = response.body.accessToken ?? '';
        refreshToken =
          setCookieParser(cookies, { map: true }).refreshToken.value ?? '';

        const payload = await jwtService.verifyAsync(accessToken);
        userId = payload.id;
      });
      // Clear db after all test
      afterAll(async () => {
        await prismaService.user.deleteMany();
      });

      it('Should get new valid access and refresh tokens', async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/refresh')
          .set('Cookie', `refreshToken=${refreshToken}`)
          .expect(HttpStatus.OK);

        const cookies = response.get('Set-Cookie') ?? [];

        // Rewrite refreshed access and refresh tokens
        accessToken = response.body.accessToken ?? '';
        refreshToken =
          setCookieParser(cookies, { map: true }).refreshToken.value ?? '';

        const accessTokenPayload = await jwtService.verifyAsync(accessToken);
        const refreshTokenPayload = await jwtService.verifyAsync(refreshToken, {
          secret: refreshJwtSecret,
        });

        expect(accessTokenPayload.id).toBe(userId);
        expect(refreshTokenPayload.id).toBe(userId);
      });

      it('Should not validate access token as a refresh token', async () => {
        await expect(
          jwtService.verifyAsync(accessToken, {
            secret: refreshJwtSecret,
          }),
        ).rejects.toThrow();
      });
    });

    describe('[POST] /logout', () => {
      // Create test user before all tests
      beforeAll(async () => {
        await request(app.getHttpServer())
          .post('/auth/register')
          .send(registerUserData);
      });
      // Clear db after all test
      afterAll(async () => {
        await prismaService.user.deleteMany();
      });

      it('Should delete refresh token from cookies on logout', async () => {
        const response = await request(httpServer)
          .post('/auth/logout')
          .expect(HttpStatus.OK);

        const cookies = response.get('Set-Cookie') ?? [];
        const refreshToken = setCookieParser(cookies, {
          map: true,
        }).refreshToken;

        expect(response.text).toBe('true');
        expect(refreshToken).toBeDefined();
        expect(refreshToken.maxAge).toBe(0);
      });
    });

    describe('[GET] /me', () => {
      let accessToken: string;

      // Create test user before all tests
      beforeAll(async () => {
        const response = await request(app.getHttpServer())
          .post('/auth/register')
          .send(registerUserData);

        accessToken = response.body.accessToken;
      });
      // Clear db after all test
      afterAll(async () => {
        await prismaService.user.deleteMany();
      });

      it('Should return user info without password', async () => {
        const response = await request(httpServer)
          .get('/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(HttpStatus.OK);

        expect(response.body).toStrictEqual(
          expect.objectContaining({
            email: expect.any(String),
            id: expect.any(String),
            name: expect.any(String),
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          }),
        );
        expect(response.body).not.haveOwnProperty('password');
      });
    });
  });
});
