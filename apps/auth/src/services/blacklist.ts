import { Collection, UpdateResult } from 'mongodb';
import { inject, injectable } from 'inversify';
import { MongoConn } from '../utils/mongo-conn';
import { Types } from '../constants/inversify-types';
import { BlacklistDoc } from './documents';
import { RepoNames } from '../constants/repo-names';

export interface IBlacklist {
  enlist(args: {
    tokenId: string;
    reasonCode: number;
    reason: string;
    expiry: number;
  }): Promise<UpdateResult<BlacklistDoc>>;

  findById(tokenId: string): Promise<BlacklistDoc | null>;
}

@injectable()
export class Blacklist implements IBlacklist {
  private blacklistCollection: Collection<BlacklistDoc>;

  constructor(@inject(Types.MONGO_CONN) conn: MongoConn) {
    this.blacklistCollection = conn.getCollection(RepoNames.BLACKLIST_COLL);
  }

  findById(tokenId: string) {
    return this.blacklistCollection.findOne({ _id: tokenId });
  }

  enlist(opts: {
    tokenId: string;
    reasonCode: number;
    reason: string;
    expiry: number;
  }) {
    return this.blacklistCollection.updateOne(
      { _id: opts.tokenId },
      {
        $set: {
          _id: opts.tokenId,
          reasonCode: opts.reasonCode,
          reason: opts.reason,
          revokedAt: new Date(),
          expiresAt: new Date(opts.expiry),
        },
      },
      {
        upsert: true,
      },
    );
  }
}
