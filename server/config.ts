import crypto from 'node:crypto';

const EPHEMERAL_JWT_SECRET = crypto.randomBytes(32).toString('hex');

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || EPHEMERAL_JWT_SECRET,
  jwtIssuer: 'ChatPilot.API',
  jwtAudience: 'ChatPilot.Client',
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenTtlDays: 7,
  superAdminPasscode: process.env.SUPER_ADMIN_PASSCODE || '',
};
