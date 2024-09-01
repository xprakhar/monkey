import { Document } from 'mongodb';

export interface AuthKeyDoc extends Document {
  _id: string;
  publicKey: string;
  privateKey: string;
  createdAt: Date;
  expriresAt: Date;
}

export interface RefreshTokenDoc extends Document {
  _id: string;
  userId: string;
  status: 'active' | 'revoked';
  createdAt: Date;
  expiresAt: Date;
}

export interface UserDoc extends Document {
  _id: string;
  birthdate: Date;
  password: string;
}

export interface BlacklistDoc extends Document {
  _id: string;
  reasonCode: number;
  reason: string;
  revokedAt: Date;
  expiresAt: Date;
}
