import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('MessagesController (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                transform: true,
                forbidNonWhitelisted: true,
            }),
        );
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    describe('POST /v1/messages', () => {
        it('should reject without API key', () => {
            return request(app.getHttpServer())
                .post('/v1/messages')
                .send({})
                .expect(401);
        });

        it('should reject with invalid API key', () => {
            return request(app.getHttpServer())
                .post('/v1/messages')
                .set('x-api-key', 'invalid-key')
                .send({})
                .expect(401);
        });
    });

    describe('GET /v1/messages/:id', () => {
        it('should reject without API key', () => {
            return request(app.getHttpServer())
                .get('/v1/messages/00000000-0000-0000-0000-000000000000')
                .expect(401);
        });
    });

    describe('GET /health/live', () => {
        it('should return 200', () => {
            return request(app.getHttpServer())
                .get('/health/live')
                .expect(200);
        });
    });
});
