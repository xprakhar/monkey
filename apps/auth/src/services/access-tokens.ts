import {
  compactDecrypt,
  CompactEncrypt,
  errors,
  JWTPayload,
  jwtVerify,
  SignJWT,
} from 'jose';
import { TextEncoder } from 'node:util';
import { randomUUID } from 'node:crypto';
import { inject, injectable } from 'inversify';
import { KeyPair } from './auth-keys';
import { IBlacklist } from './blacklist';
import { Types } from '../constants/inversify-types';
import { Jwt } from '../constants/jwt';
import { IUsers } from './users';
import { BlacklistDoc } from './documents';
import { UpdateResult } from 'mongodb';

export interface IAccessTokens {
  sign(userId: string, keyPair: KeyPair): Promise<string>;

  signAndEncrypt(userId: string, keyPair: KeyPair): Promise<string>;

  revoke(
    args: {
      accessToken: string;
      reason: string;
      reasonCode: number;
    },
    keyPair: KeyPair,
  ): Promise<UpdateResult<BlacklistDoc>>;

  verify(accessToken: string, keyPair: KeyPair): Promise<JWTPayload>;
}

@injectable()
export class AccessTokens implements IAccessTokens {
  private users: IUsers;
  private blacklist: IBlacklist;

  constructor(
    @inject(Types.USERS) users: IUsers,
    @inject(Types.BLACKLIST) blacklist: IBlacklist,
  ) {
    this.users = users;
    this.blacklist = blacklist;
  }

  async revoke(
    args: { accessToken: string; reason: string; reasonCode: number },
    keyPair: KeyPair,
  ) {
    const { publicKey, privateKey } = keyPair;
    const { plaintext: decrypted } = await compactDecrypt(
      args.accessToken,
      privateKey,
    );

    const decoded = new TextDecoder().decode(decrypted);
    const { payload } = await jwtVerify(decoded, publicKey, {
      issuer: Jwt.ISSUER,
      audience: Jwt.AUDIENCE,
      maxTokenAge: Jwt.MAX_AGE,
      clockTolerance: 60,
      requiredClaims: ['sub', 'jti', 'exp'],
      algorithms: ['RS256'],
    });

    return this.blacklist.enlist({
      tokenId: payload.jti as string,
      expiry: payload.exp as number,
      reason: 'Explicit Request',
      reasonCode: 1,
    });
  }

  async sign(userId: string, keyPair: KeyPair) {
    const { kid, privateKey } = keyPair;
    return new SignJWT()
      .setAudience(Jwt.AUDIENCE)
      .setIssuer(Jwt.ISSUER)
      .setIssuedAt()
      .setExpirationTime(Jwt.MAX_AGE)
      .setJti(randomUUID())
      .setSubject(userId)
      .setProtectedHeader({ kid, alg: 'RS256', typ: 'JWT' })
      .sign(privateKey);
  }

  async signAndEncrypt(userId: string, keyPair: KeyPair) {
    const { kid, publicKey, privateKey } = keyPair;
    const jwt = await new SignJWT()
      .setAudience(Jwt.AUDIENCE)
      .setIssuer(Jwt.ISSUER)
      .setIssuedAt()
      .setExpirationTime(Jwt.MAX_AGE)
      .setJti(randomUUID())
      .setSubject(userId)
      .setProtectedHeader({ kid, alg: 'RS256', typ: 'JWT' })
      .sign(privateKey);

    return new CompactEncrypt(new TextEncoder().encode(jwt))
      .setProtectedHeader({ cty: 'JWT', alg: 'RSA-OAEP', enc: 'A256GCM' })
      .encrypt(publicKey);
  }

  async verify(token: string, keyPair: KeyPair): Promise<JWTPayload> {
    const { publicKey, privateKey } = keyPair;
    const { plaintext: decrypted } = await compactDecrypt(token, privateKey);

    const decoded = new TextDecoder().decode(decrypted);
    const { payload } = await jwtVerify(decoded, publicKey, {
      issuer: Jwt.ISSUER,
      audience: Jwt.AUDIENCE,
      maxTokenAge: Jwt.MAX_AGE,
      clockTolerance: 60,
      requiredClaims: ['sub', 'jti', 'exp'],
      algorithms: ['RS256'],
    });

    const blacklisted = await this.blacklist.findById(payload.jti as string);
    if (blacklisted) {
      throw new errors.JWTInvalid('This token has been revoked');
    }

    const user = await this.users.findById(payload.sub as string);
    if (!user) {
      throw new errors.JWTClaimValidationFailed(
        'Invalid sub (subject) claim',
        payload,
        'sub',
        'User not found',
      );
    }

    return payload;
  }
}
