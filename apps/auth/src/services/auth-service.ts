import { inject } from 'inversify';
import { decodeProtectedHeader, errors } from 'jose';
import { IAccessTokens } from './access-tokens';
import { IAuthKeys } from './auth-keys';
import { IRefreshTokens } from './refresh-tokens';
import { Types } from '../constants/inversify-types';
import { IUsers } from './users';
import { UpdateResult } from 'mongodb';
import { BlacklistDoc, RefreshTokenDoc } from './documents';
import { logger } from '../utils/logger';
import {
  JWEDecryptionFailed,
  JWSSignatureVerificationFailed,
  JWTClaimValidationFailed,
  JWTInvalid,
} from 'jose/dist/types/util/errors';

export interface IAuthService {
  authenticate(accessToken: string): Promise<boolean>;

  authorize(userId: string, password: string): Promise<[string, string]>;

  refreshAccessToken(refreshToken: string): Promise<string>;

  revokeTokens(args: {
    accessToken: string;
    refreshToken: string;
  }): Promise<[UpdateResult<BlacklistDoc>, UpdateResult<RefreshTokenDoc>]>;
}

export class AuthService implements IAuthService {
  private refreshTokens: IRefreshTokens;
  private accessTokens: IAccessTokens;
  private authKeys: IAuthKeys;
  private users: IUsers;

  constructor(
    @inject(Types.USERS) users: IUsers,
    @inject(Types.AUTH_KEYS) authKeys: IAuthKeys,
    @inject(Types.AUTH_KEYS) accessTokens: IAccessTokens,
    @inject(Types.REFRESH_TOKENS) refreshTokens: IRefreshTokens,
  ) {
    this.users = users;
    this.authKeys = authKeys;
    this.accessTokens = accessTokens;
    this.refreshTokens = refreshTokens;
  }

  async authorize(userId: string, password: string) {
    if (await this.users.verify(userId, password)) {
      const keyPair = await this.authKeys.getKeyPair();
      return Promise.all([
        this.accessTokens.signAndEncrypt(userId, keyPair),
        this.refreshTokens.issue(userId, keyPair),
      ]);
    } else {
      throw new Error('Invalid username or password');
    }
  }

  async authenticate(accessToken: string) {
    try {
      const { kid } = decodeProtectedHeader(accessToken);
      if (!kid) {
        logger.log('error', 'Required header parameter (kid) keyId is missing');
        return false;
      }

      const keyPair = await this.authKeys.getKeysByID(kid);
      if (!keyPair) {
        logger.log('error', 'Header parameter (kid) keyId is invalid');
        return false;
      }

      await this.accessTokens.verify(accessToken, keyPair);

      return true;
    } catch (error) {
      if (error instanceof JWEDecryptionFailed) {
        logger.log('error', `JWT decryption  failed: ${error.message}`);
      } else if (error instanceof JWSSignatureVerificationFailed) {
        logger.log(
          'error',
          `JWT signature verification failed: ${error.message}`,
        );
      } else if (error instanceof JWTClaimValidationFailed) {
        if (error.code === 'ERR_JWT_EXPIRED') {
          logger.log(
            'error',
            'JWT is expired, request a refresh or issue a new one',
          );
        } else {
          logger.log(
            'error',
            `JWT claim [${error.claim}] validation failed: ${error.message}`,
          );
        }
      } else if (error instanceof JWTInvalid) {
        logger.log('error', `JWT invalid: ${error.message}`);
      }

      return false;
    }
  }

  async refreshAccessToken(refreshToken: string) {
    const { kid } = decodeProtectedHeader(refreshToken);
    if (!kid) {
      throw new errors.JWEInvalid(
        'Required header parameter (kid) keyId is missing',
      );
    }
    const keyPair = await this.authKeys.getKeysByID(kid);
    if (!keyPair) {
      throw new errors.JWEDecryptionFailed('Invalid Token');
    }

    const tokenDoc = await this.refreshTokens.verify(refreshToken, keyPair);

    return this.accessTokens.signAndEncrypt(tokenDoc.userId, keyPair);
  }

  async revokeTokens(args: { accessToken: string; refreshToken: string }) {
    const { accessToken, refreshToken } = args;

    const { kid } = decodeProtectedHeader(accessToken);
    if (!kid) {
      throw new errors.JWEInvalid(
        'Required header parameter (kid) keyId is missing',
      );
    }
    const keyPair = await this.authKeys.getKeysByID(kid);
    if (!keyPair) {
      throw new errors.JWEDecryptionFailed('Invalid Token');
    }

    return await Promise.all([
      this.accessTokens.revoke(
        { accessToken, reasonCode: 1, reason: 'Manually Invoked' },
        keyPair,
      ),
      this.refreshTokens.revoke(refreshToken, keyPair),
    ]);
  }
}
