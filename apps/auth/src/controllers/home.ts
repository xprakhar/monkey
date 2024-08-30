import type { Request, Response } from 'express';
import {
  controller,
  httpGet,
  httpPost,
  request,
  response,
} from 'inversify-express-utils';
import { ZodError } from 'zod';
import { signupSchema } from '../schemas/SignupSchema';
import { IUserRepository } from '../services/UserRepository';
import { TYPES } from '../inversify-types';
import { inject } from 'inversify';
import { StatusCodes } from 'http-status-codes';
import { MongoServerError } from 'mongodb';

@controller('/')
export class Home {
  private usersRepo: IUserRepository;

  constructor(@inject(TYPES.UserRepository) usersRepo: IUserRepository) {
    this.usersRepo = usersRepo;
  }

  @httpGet('greet')
  async greet(@request() req: Request, @response() res: Response) {
    return res.status(200).json({ message: 'Welcome Mofo' });
  }

  @httpPost('register')
  async register(@request() req: Request, @response() res: Response) {
    try {
      const { email, password, birthdate } = signupSchema.parse(req.body);

      await this.usersRepo.save({
        _id: email,
        password: password,
        birthdate,
      });

      res.status(StatusCodes.OK).json({
        status: 'success',
        message: 'User successfully registered',
      });
    } catch (error) {
      if (error instanceof ZodError) {
        res.status(StatusCodes.BAD_REQUEST).json({
          status: 'failed',
          message: error.issues.map((issue) => issue.message).join(', '),
        });
        return;
      }

      if (error instanceof MongoServerError) {
        if (error.code === 11000) {
          res.status(StatusCodes.CONFLICT).json({
            status: 'failed',
            message: 'A user with this email address already exists',
          });
        } else {
          res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            status: 'failed',
            message: error.errmsg,
          });
        }
        return;
      }

      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        status: 'failed',
        message: 'An unexpected error occurred, try again later',
      });
    }
  }
}
