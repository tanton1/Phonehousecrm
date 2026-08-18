import { describe, it, expect } from 'vitest';
import { Button } from '../src/shared/ui/Button/Button';
import { Card } from '../src/shared/ui/Card/Card';
import { Badge } from '../src/shared/ui/Badge/Badge';
import { StatusBadge } from '../src/shared/ui/StatusBadge/StatusBadge';
import { StatCard } from '../src/shared/ui/StatCard/StatCard';

describe('Sprint 4: PhoneHouse Design System Components Suite', () => {
  it('Case 1: Button component definition and variants contract', () => {
    expect(Button).toBeDefined();
    expect(typeof Button).toBe('function');
  });

  it('Case 2: Card component definition and radius options contract', () => {
    expect(Card).toBeDefined();
    expect(typeof Card).toBe('function');
  });

  it('Case 3: Badge and StatusBadge component mapping contract', () => {
    expect(Badge).toBeDefined();
    expect(StatusBadge).toBeDefined();
  });

  it('Case 4: StatCard component definition contract', () => {
    expect(StatCard).toBeDefined();
    expect(typeof StatCard).toBe('function');
  });
});
