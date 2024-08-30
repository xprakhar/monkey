import { render } from '@testing-library/react';

import SignupForm from './SignupForm';

describe('Signup', () => {
  it('should render successfully', () => {
    const { baseElement } = render(<SignupForm />);
    expect(baseElement).toBeTruthy();
  });
});
