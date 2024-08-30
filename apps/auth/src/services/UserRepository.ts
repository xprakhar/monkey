import { Document, InsertOneResult } from 'mongodb';
import { IRepository } from './Repository';
import { MongoConn } from '../MongoConn';
import { inject, injectable } from 'inversify';
import { TYPES } from '../inversify-types';
import * as argon2 from 'argon2';

export interface UserDocument extends Document {
  _id: string;
  birthdate: Date;
  password: string;
}

export interface IUserRepository extends IRepository<UserDocument> {
  save(user: UserDocument): Promise<InsertOneResult<UserDocument>>;
}

@injectable()
export class UserRepository implements IUserRepository {
  private conn: MongoConn;

  constructor(@inject(TYPES.MongoConn) conn: MongoConn) {
    this.conn = conn;
  }
  async save(user: UserDocument) {
    const { password } = user;

    const hash = await argon2.hash(password, {
      timeCost: 4,
      parallelism: 5,
      type: argon2.argon2id,
    });

    return (await this.getCollection()).insertOne({ ...user, password: hash });
  }
  async findById(id: string) {
    return (await this.getCollection()).findOne({ _id: id });
  }
  async updateById(id: string, doc: Partial<UserDocument>) {
    return (await this.getCollection()).updateOne(
      { _id: id },
      { $set: doc },
      { upsert: true },
    );
  }
  async deleteById(id: string) {
    return (await this.getCollection()).deleteOne({ _id: id });
  }

  private getCollection() {
    return this.conn.getCollection<UserDocument>('users');
  }
}
