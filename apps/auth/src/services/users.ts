import * as argon2 from 'argon2';
import { Collection, InsertOneResult } from 'mongodb';
import { inject, injectable } from 'inversify';
import { MongoConn } from '../utils/mongo-conn';
import { Types } from '../constants/inversify-types';
import { UserDoc } from './documents';
import { IRepository } from './IRepo';
import { RepoNames } from '../constants/repo-names';
import { logger } from '../utils/logger';

export interface IUsers extends IRepository<UserDoc> {
  save(user: UserDoc): Promise<InsertOneResult<UserDoc>>;

  verify(userId: string, password: string): Promise<boolean>;
}

@injectable()
export class Users implements IUsers {
  private usersCollection: Collection<UserDoc>;

  constructor(@inject(Types.MONGO_CONN) conn: MongoConn) {
    this.usersCollection = conn.getCollection(RepoNames.USERS_COLL);
  }

  async verify(userId: string, password: string): Promise<boolean> {
    const user = await this.usersCollection.findOne({ _id: userId });
    if (!user) {
      logger.log(
        'error',
        `User verification failed: A user with email address (${userId}) does not exist`,
      );
      return false;
    }
    try {
      if (await argon2.verify(password, user.password)) {
        return true;
      } else {
        logger.log(
          'error',
          `User verification failed: Password does not match`,
        );

        return false;
      }
    } catch (error) {
      logger.log('error', (error as Error).message);

      return false;
    }
  }

  async save(user: UserDoc) {
    const { password } = user;

    const hash = await argon2.hash(password, {
      timeCost: 4,
      parallelism: 5,
      type: argon2.argon2id,
    });

    return this.usersCollection.insertOne({ ...user, password: hash });
  }

  async findById(id: string) {
    return this.usersCollection.findOne({ _id: id });
  }

  async updateById(id: string, doc: Partial<UserDoc>) {
    return this.usersCollection.updateOne(
      { _id: id },
      { $set: doc },
      { upsert: true },
    );
  }

  async deleteById(id: string) {
    return this.usersCollection.deleteOne({ _id: id });
  }
}
