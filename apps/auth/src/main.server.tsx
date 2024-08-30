import * as express from 'express';
import * as fs from 'fs';
import * as ReactDOMServer from 'react-dom/server';
import isbot from 'isbot';

import {
  StaticHandlerContext,
  StaticRouterProvider,
  createStaticHandler,
  createStaticRouter,
} from 'react-router-dom/server';
import { routes } from './router';

let indexHtml: null | string = null;

const createFetchRequest = (req: express.Request, res: express.Response) => {
  const origin = `${req.protocol}://${req.get('host')}`;
  // Note: This had to take originalUrl into account for presumably vite's proxying
  const url = new URL(req.originalUrl || req.url, origin);

  const controller = new AbortController();
  res.on('close', () => controller.abort());

  const headers = new Headers();

  for (const [key, values] of Object.entries(req.headers)) {
    if (values) {
      if (Array.isArray(values)) {
        for (const value of values) {
          headers.append(key, value);
        }
      } else {
        headers.set(key, values);
      }
    }
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    signal: controller.signal,
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body;
  }

  return new Request(url.href, init);
};

export function handleRequest(indexPath: string) {
  return async function render(req: express.Request, res: express.Response) {
    let didError = false;

    if (!indexHtml) {
      indexHtml = fs.readFileSync(indexPath).toString();
    }

    const [htmlStart, htmlEnd] = indexHtml.split(`<div id="root"></div>`);

    // For bots (e.g. search engines), the content will not be streamed but render all at once.
    // For users, content should be streamed to the user as they are ready.
    const callbackName = isbot(req.headers['user-agent'])
      ? 'onAllReady'
      : 'onShellReady';

    const fetchRequest = createFetchRequest(req, res);
    const context = await createStaticHandler(routes).query(fetchRequest);

    if (
      context instanceof Response &&
      [301, 302, 303, 307, 308].includes(context.status)
    ) {
      return res.redirect(
        context.status,
        context.headers.get('Location') as string
      );
    }

    const router = createStaticRouter(routes, context as StaticHandlerContext);

    const stream = ReactDOMServer.renderToPipeableStream(
      <StaticRouterProvider
        router={router}
        context={context as StaticHandlerContext}
      />,
      {
        [callbackName]() {
          res.statusCode = didError ? 500 : 200;
          res.setHeader('Content-type', 'text/html; charset=utf-8');
          res.write(`${htmlStart}<div id="root">`);
          stream.pipe(res);
          res.write(`</div>${htmlEnd}`);
        },
        onShellError(error) {
          console.error(error);
          res.statusCode = 500;
          res.send('<!doctype html><h1>Server Error</h1>');
        },
        onError(error) {
          didError = true;
          console.error(error);
        },
      }
    );
  };
}
