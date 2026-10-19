import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import NotFound from '../NotFound';

describe('NotFound', () => {
  it('renders 404 heading when navigating to non-existent route', () => {
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <NotFound />
      </MemoryRouter>
    );

    expect(screen.getByText(/404/i)).toBeInTheDocument();
    expect(screen.getByText(/page not found/i)).toBeInTheDocument();
  });

  it('provides links to marketplace and home', () => {
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <NotFound />
      </MemoryRouter>
    );

    const marketplaceLink = screen.getByRole('link', { name: /marketplace/i });
    const homeLink = screen.getByRole('link', { name: /home/i });

    expect(marketplaceLink).toHaveAttribute('href', '/marketplace');
    expect(homeLink).toHaveAttribute('href', '/');
  });
});
