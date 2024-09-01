import { Collection, InsertOneResult, UpdateResult } from 'mongodb';
import { inject, injectable } from 'inversify';
import { randomUUID } from 'node:crypto';
import { compactDecrypt, CompactEncrypt, errors } from 'jose';
import { IRepository } from './IRepo';
import { RefreshTokenDoc } from './documents';
import { MongoConn } from '../utils/mongo-conn';
import { parseDuration } from '../utils/helpers';
import { Types } from '../constants/inversify-types';
import { RefreshToken } from '../constants/refresh-token';
import { RepoNames } from '../constants/repo-names';
import { KeyPair } from './auth-keys';

export interface IRefreshTokens extends IRepository<RefreshTokenDoc> {
  save(doc: {
    _id: string;
    userId: string;
  }): Promise<InsertOneResult<RefreshTokenDoc>>;

  issue(userId: string, keyPair: KeyPair): Promise<string>;
  revoke(
    token: string,
    keyPair: KeyPair,
  ): Promise<UpdateResult<RefreshTokenDoc>>;

  verify(token: string, keyPair: KeyPair): Promise<RefreshTokenDoc>;
}

@injectable()
export class RefreshTokens implements IRefreshTokens {
  private tokensCollection: Collection<RefreshTokenDoc>;

  constructor(@inject(Types.MONGO_CONN) conn: MongoConn) {
    this.tokensCollection = conn.getCollection(RepoNames.REFRESH_TOKEN_COLL);
  }

  async verify(token: string, keyPair: KeyPair) {
    const { privateKey } = keyPair;

    const { plaintext: decrypted } = await compactDecrypt(token, privateKey);

    const tokenId = new TextDecoder().decode(decrypted);

    const tokenDoc = await this.tokensCollection.findOne({ _id: tokenId });
    if (!tokenDoc) {
      throw new errors.JWEInvalid('Refresh token id is incorrect');
    }

    if (tokenDoc.status === 'revoked') {
      throw new Error('This refresh token was revoked.');
    } else if (tokenDoc.expiresAt > new Date()) {
      throw new Error('This refresh token has expired.');
    }

    return tokenDoc;
  }

  async issue(userId: string, keyPair: KeyPair) {
    const tokenId = randomUUID(); // generate a random token ID:

    const { kid, publicKey } = keyPair;
    const encrypted = new CompactEncrypt(new TextEncoder().encode(tokenId))
      .setProtectedHeader({
        alg: 'RSA-OAEP',
        enc: 'A256GCM',
        kid,
      })
      .encrypt(publicKey);
    await this.save({ _id: tokenId, userId });

    return encrypted;
  }

  async revoke(token: string, keyPair: KeyPair) {
    const { privateKey } = keyPair;

    const { plaintext: decrypted } = await compactDecrypt(token, privateKey);

    const tokenId = new TextDecoder().decode(decrypted);

    return this.tokensCollection.updateOne(
      { _id: tokenId },
      { $set: { status: 'revoked' } },
      { upsert: true },
    );
  }

  async save(refreshToken: { _id: string; userId: string }) {
    const refreshTokenDoc: RefreshTokenDoc = {
      _id: refreshToken._id,
      userId: refreshToken.userId,
      status: 'active',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + parseDuration(RefreshToken.MAX_AGE)),
    };

    return this.tokensCollection.insertOne(refreshTokenDoc);
  }

  findById(id: string) {
    return this.tokensCollection.findOne({ _id: id });
  }

  updateById(id: string, doc: Partial<RefreshTokenDoc>) {
    return this.tokensCollection.updateOne({ _id: id }, { $set: doc });
  }

  deleteById(id: string) {
    return this.tokensCollection.deleteOne({ _id: id });
  }
}
