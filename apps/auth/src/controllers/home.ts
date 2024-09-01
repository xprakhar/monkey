import type { Request, Response } from 'express';
import {
  controller,
  httpGet,
  httpPost,
  request,
  response,
} from 'inversify-express-utils';
import { ZodError } from 'zod';
import { StatusCodes } from 'http-status-codes';
import { MongoServerError } from 'mongodb';
import { signupSchema } from '../schemas/signup-schema';
import { IUsers } from '../services/users';
import { Types } from '../constants/inversify-types';
import { inject } from 'inversify';
import { IAuthService } from '../services/auth-service';
import { loginSchema } from '../schemas/login-schema';

@controller('/')
export class Home {
  private users: IUsers;
  private authService: IAuthService;

  constructor(
    @inject(Types.USERS) usersRepo: IUsers,
    @inject(Types.AUTH_SERVICE) authService: IAuthService,
  ) {
    this.users = usersRepo;
    this.authService = authService;
  }

  @httpGet('greet')
  async greet(@request() req: Request, @response() res: Response) {
    return res.status(200).json({ message: 'Welcome Mofo' });
  }

  @httpPost('register')
  async register(@request() req: Request, @response() res: Response) {
    try {
      const { email, password, birthdate } = signupSchema.parse(req.body);

      await this.users.save({
        _id: email,
        password: password,
        birthdate,
      });

      res.status(StatusCodes.CREATED).json({
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

  @httpPost('login')
  async login(@request() req: Request, @response() res: Response) {
    try {
      const { username, password } = loginSchema.parse(req.body);
      const [accessToken, refreshToken] = await this.authService.authorize(
        username,
        password,
      );

      res.send(StatusCodes.OK).json({
        status: 'success',
        message: {
          accessToken,
          refreshToken,
        },
      });
    } catch (error) {
      res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        status: 'failed',
        message: 'An unexpected error occurred, try again later',
      });
    }
  }
}
