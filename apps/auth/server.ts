import * as path from 'path';
import 'reflect-metadata';
import express from 'express';
import bodyParser from 'body-parser';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { InversifyExpressServer } from 'inversify-express-utils';
import { handleRequest } from './src/main.server';
import { container } from './src/inversify-container';
import { logger } from './src/utils/logger';

const port = process.env['PORT'] || 4200;
const app = express();

const browserDist = path.join(process.cwd(), 'dist/apps/auth/browser');
const indexPath = path.join(browserDist, 'index.html');

app.use(cors());

const server = new InversifyExpressServer(
  container,
  null,
  {
    rootPath: '/api/v1',
  },
  app,
)
  .setConfig((app) => {
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());
    app.use(cookieParser());
  })
  .build();

app.get('*.*', express.static(browserDist));

app.use('*', handleRequest(indexPath));

const listener = app.listen(port, () => {
  console.log(`Express server listening on http://localhost:${port}`);
});

listener.on('error', (err) =>
  logger.log('error', `An error occurred on server startup: ${err.message}`),
);

export { server };
