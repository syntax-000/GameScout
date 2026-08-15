import { describe, expect, it, vi } from 'vitest';
import {
  getFavoriteErrorMessage,
  persistFavoriteChange,
} from '../../src/renderer/src/components/favorite-control-helpers';

describe('favorite controls', () => {
  it('uses the requested add or remove operation and returns persisted state', async () => {
    const api = {
      addFavorite: vi.fn().mockResolvedValue({ ok: true, isFavorite: true }),
      removeFavorite: vi.fn().mockResolvedValue({ ok: true, isFavorite: false }),
    };

    await expect(persistFavoriteChange(api, 41, true)).resolves.toBe(true);
    expect(api.addFavorite).toHaveBeenCalledWith(41);
    expect(api.removeFavorite).not.toHaveBeenCalled();

    await expect(persistFavoriteChange(api, 41, false)).resolves.toBe(false);
    expect(api.removeFavorite).toHaveBeenCalledWith(41);
  });

  it('turns controlled persistence failures into actionable errors', async () => {
    const api = {
      addFavorite: vi.fn().mockResolvedValue({ ok: false, error: 'Game no longer exists.' }),
      removeFavorite: vi.fn(),
    };

    await expect(persistFavoriteChange(api, 99, true)).rejects.toThrow('Game no longer exists.');
    expect(getFavoriteErrorMessage(new Error('Please retry.'))).toBe('Please retry.');
    expect(getFavoriteErrorMessage(null)).toBe('The favorite could not be updated. Try again.');
  });
});
