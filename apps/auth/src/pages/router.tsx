import { Outlet, RouteObject } from 'react-router-dom';
import { Route as LoginRoute } from './login/Page';
import { Route as SignupRoute, action as SignupAction } from './signup/Page';

export const routes: RouteObject[] = [
  {
    path: '/',
    Component: Outlet,
    children: [
      {
        index: true,
        Component: LoginRoute,
      },
      {
        path: '/signup',
        Component: SignupRoute,
        action: SignupAction,
      },
    ],
  },
];
