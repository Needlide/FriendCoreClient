import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Tags } from './tags';
import { configureAuthTestBed, expectApi } from '../../auth/test-utils';

const tags = {
  tags: [
    {
      tagId: 't1',
      name: 'spiders',
      slug: 'spiders',
      createdAt: new Date().toISOString(),
      createdById: 'u1',
      creatorUsername: 'arachnofan',
      creatorDisplayName: 'Arachnophobe',
    },
    {
      tagId: 't2',
      name: 'explicit-art',
      slug: 'explicit-art',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      createdById: 'u2',
      creatorUsername: 'artist99',
      creatorDisplayName: 'Artist',
    },
  ],
};

describe('Tags', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([Tags]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(Tags);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('lists pending tags with moderation actions', () => {
    const { fixture, el } = create();
    expectApi(http, '/tags/moderation/queue').flush(tags);
    fixture.detectChanges();

    expect(el.textContent).toContain('spiders');
    expect(el.textContent).toContain('explicit-art');
    expect(el.textContent).toContain('arachnofan');
    expect(el.textContent).toContain('artist99');
  });

  it('approves the spiders tag', () => {
    const { fixture, el } = create();
    expectApi(http, '/tags/moderation/queue').flush(tags);
    fixture.detectChanges();

    // Find the row for 'spiders' and click its Approve button
    const rows = Array.from(el.querySelectorAll('tbody tr'));
    const spidersRow = rows.find((r) => r.textContent?.includes('spiders'));
    expect(spidersRow).not.toBeUndefined();
    const approveBtn = spidersRow!.querySelector('button') as HTMLButtonElement;
    expect(approveBtn.textContent).toBe('Approve');
    approveBtn.click();
    fixture.detectChanges();

    const req = expectApi(http, '/tags/t1/moderation');
    expect(req.request.body).toEqual({ action: 'Approve' });
    req.flush(null);
  });

  it('archives a tag', () => {
    const { fixture, el } = create();
    expectApi(http, '/tags/moderation/queue').flush(tags);
    fixture.detectChanges();

    const rows = Array.from(el.querySelectorAll('tbody tr'));
    const spidersRow = rows.find((r) => r.textContent?.includes('spiders'));
    const archiveBtn = Array.from(spidersRow!.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Archive',
    ) as HTMLButtonElement;
    archiveBtn.click();
    fixture.detectChanges();

    const req = expectApi(http, '/tags/t1/moderation');
    expect(req.request.body).toEqual({ action: 'Archive' });
    req.flush(null);
  });

  it('bans a tag', () => {
    const { fixture, el } = create();
    expectApi(http, '/tags/moderation/queue').flush(tags);
    fixture.detectChanges();

    const rows = Array.from(el.querySelectorAll('tbody tr'));
    const spidersRow = rows.find((r) => r.textContent?.includes('spiders'));
    const banBtn = Array.from(spidersRow!.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Ban',
    ) as HTMLButtonElement;
    banBtn.click();
    fixture.detectChanges();

    const req = expectApi(http, '/tags/t1/moderation');
    expect(req.request.body).toEqual({ action: 'Ban' });
    req.flush(null);
  });

  it('shows "no tags pending review" when empty', () => {
    const { fixture, el } = create();
    expectApi(http, '/tags/moderation/queue').flush({ tags: [] });
    fixture.detectChanges();

    expect(el.textContent).toContain('No tags pending review');
  });
});
