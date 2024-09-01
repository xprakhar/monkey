import { Container } from 'inversify';
import { Types } from './constants/inversify-types';
import { MongoConn } from './utils/mongo-conn';
import { IUsers, Users } from './services/users';
import { IAuthKeys, AuthKeys } from './services/auth-keys';
import { IBlacklist, Blacklist } from './services/blacklist';
import { IRefreshTokens, RefreshTokens } from './services/refresh-tokens';
import './controllers/home';
import { AuthService, IAuthService } from './services/auth-service';

const container = new Container();

container.bind<MongoConn>(Types.MONGO_CONN).to(MongoConn);
container.bind<IUsers>(Types.USERS).to(Users);
container.bind<IAuthKeys>(Types.AUTH_KEYS).to(AuthKeys);
container.bind<IBlacklist>(Types.BLACKLIST).to(Blacklist);
container.bind<IRefreshTokens>(Types.REFRESH_TOKENS).to(RefreshTokens);
container.bind<IAuthService>(Types.AUTH_SERVICE).to(AuthService);

export { container };
