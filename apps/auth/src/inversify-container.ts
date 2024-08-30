import { Container } from 'inversify';
import { TYPES } from './inversify-types';
import { MongoConn } from './MongoConn';
import './controllers/home';
import { IUserRepository, UserRepository } from './services/UserRepository';

const container = new Container();

container.bind<MongoConn>(TYPES.MongoConn).to(MongoConn);
container.bind<IUserRepository>(TYPES.UserRepository).to(UserRepository);

export { container };
