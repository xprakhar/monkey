import { render } from '@testing-library/react';

import LoginForm from './LoginForm';

describe('Login', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<LoginForm />);
    expect(baseElement).toBeTruthy();
  });
});
