import { describe, expect, it } from 'vitest';
import { createBrowseHandlers } from '../../src/main/ipc/browse-handlers';
import { createBrowsePageRequest, createGameDetailsRequest } from '../../src/shared/ipc/contracts';

describe('browse IPC handlers', () => {
  it('validates requests before reading the database', () => {
    let reads = 0;
    const handlers = createBrowseHandlers(() => {
      reads += 1;
      return null;
    });
    expect(() =>
      handlers.getBrowsePage(createBrowsePageRequest(0, 12, 'title_asc', '', null, 'any', null)),
    ).toThrow('database');
    expect(reads).toBe(1);
    expect(() => handlers.getBrowsePage({ protocolVersion: 1, offset: 0, pageSize: 12 })).toThrow(
      'invalid',
    );
    expect(() =>
      handlers.getBrowsePage(createBrowsePageRequest(0, 101, 'title_asc', '', null, 'any', null)),
    ).toThrow('page size');
    expect(() =>
      handlers.getBrowsePage(
        createBrowsePageRequest(0, 12, 'title_asc', 'x'.repeat(201), null, 'any', null),
      ),
    ).toThrow('query');
    expect(() =>
      handlers.getBrowsePage(
        createBrowsePageRequest(0, 12, 'title_asc', '', null, 'invalid' as never, null),
      ),
    ).toThrow('multiplayer');
    expect(() =>
      handlers.getBrowsePage(createBrowsePageRequest(0, 12, 'title_asc', '', null, 'any', 17)),
    ).toThrow('players');
    expect(() =>
      handlers.getBrowsePage(
        createBrowsePageRequest(0, 12, 'unsupported' as never, '', null, 'any', null),
      ),
    ).toThrow('sort');
    expect(() => handlers.getBrowseGenres({ protocolVersion: 1 })).toThrow('database');
    expect(() => handlers.getGameDetails(createGameDetailsRequest(1))).toThrow('database');
    expect(() => handlers.getGameDetails(createGameDetailsRequest(0))).toThrow('ID');
  });
});
