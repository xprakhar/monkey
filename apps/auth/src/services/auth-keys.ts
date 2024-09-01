import { Collection, InsertOneResult } from 'mongodb';
import { inject, injectable } from 'inversify';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPair,
  KeyObject,
} from 'node:crypto';
import { JSONWebKeySet, JWK } from 'jose';
import { IRepository } from './IRepo';
import { MongoConn } from '../utils/mongo-conn';
import { parseDuration } from '../utils/helpers';
import { Types } from '../constants/inversify-types';
import { AuthKey } from '../constants/auth-keys';
import { promisify } from 'node:util';
import { RepoNames } from '../constants/repo-names';
import { AuthKeyDoc } from './documents';

export interface KeyPair {
  kid: string;
  publicKey: KeyObject;
  privateKey: KeyObject;
}

export interface IAuthKeys extends IRepository<AuthKeyDoc> {
  save(keys: {
    publicKey: string;
    privateKey: string;
  }): Promise<InsertOneResult<AuthKeyDoc>>;

  findActive(): Promise<AuthKeyDoc | null>;

  getJWKS(): Promise<JSONWebKeySet | null>;

  getKeyPair(): Promise<KeyPair>;

  getKeysByID(kid: string): Promise<KeyPair | null>;
}

@injectable()
export class AuthKeys implements IAuthKeys {
  private keysCollection: Collection<AuthKeyDoc>;

  constructor(@inject(Types.MONGO_CONN) conn: MongoConn) {
    this.keysCollection = conn.getCollection(RepoNames.AUTH_KEY_COLL);
  }

  async save(keys: { publicKey: string; privateKey: string }) {
    return this.keysCollection.insertOne({
      _id: crypto.randomUUID() as string,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      createdAt: new Date(),
      expriresAt: new Date(Date.now() + parseDuration(AuthKey.MAX_AGE)),
    });
  }

  async findActive() {
    return this.keysCollection.findOne({ expriresAt: { $gt: new Date() } });
  }

  async findById(id: string) {
    return this.keysCollection.findOne({ _id: id });
  }

  async getJWKS() {
    const cursor = await this.keysCollection
      .find()
      .project<{ _id: string; publicKey: string }>({ publicKey: true });

    const keys: JWK[] = [];
    for await (const { _id: kid, publicKey: publicKeyPem } of cursor) {
      const jwk = createPublicKey({
        key: publicKeyPem,
        type: 'spki',
        format: 'pem',
      }).export({ format: 'jwk' }) as JWK;

      jwk.kid = kid;

      keys.push(jwk);
    }

    cursor.close();

    return keys.length ? { keys } : null;
  }

  async getKeysByID(kid: string) {
    const keyDoc = await this.keysCollection.findOne({ _id: kid });
    if (!keyDoc) return null;

    return {
      kid: keyDoc._id,
      publicKey: createPublicKey({
        key: keyDoc.publicKey,
        format: 'pem',
        type: 'spki',
      }),
      privateKey: createPrivateKey({
        key: keyDoc.privateKey,
        format: 'pem',
        type: 'pkcs8',
        passphrase: process.env.PASSPHRASE,
      }),
    };
  }

  async getKeyPair() {
    const keyPair = await this.findActive();
    if (!keyPair) {
      const genKeyPair = promisify(generateKeyPair);

      const newKeyPair = await genKeyPair('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
          passphrase: process.env.PASSPRASE,
        },
      });

      // Save the PEM formatted keys in the database
      const { insertedId } = await this.save(newKeyPair);

      // Convert PEM to KeyObject for immediate usage
      const privateKeyObject = createPrivateKey({
        key: newKeyPair.privateKey,
        format: 'pem',
        passphrase: process.env.PASSPHRASE,
      });
      const publicKeyObject = createPublicKey({
        key: newKeyPair.publicKey,
        format: 'pem',
      });

      return {
        kid: insertedId,
        privateKey: privateKeyObject,
        publicKey: publicKeyObject,
      };
    } else {
      // If an active key pair already exists, convert PEM to KeyObject
      const privateKeyObject = createPrivateKey({
        key: keyPair.privateKey,
        format: 'pem',
        passphrase: process.env.PASSPHRASE,
      });
      const publicKeyObject = createPublicKey({
        key: keyPair.publicKey,
        format: 'pem',
      });

      return {
        kid: keyPair._id,
        privateKey: privateKeyObject,
        publicKey: publicKeyObject,
      };
    }
  }

  async updateById(id: string, doc: Partial<AuthKeyDoc>) {
    return this.keysCollection.updateOne(
      { _id: id },
      { $set: doc },
      { upsert: true },
    );
  }

  async deleteById(id: string) {
    return this.keysCollection.deleteOne({ _id: id });
  }
}
