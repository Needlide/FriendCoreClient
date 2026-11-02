import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Onboarding } from './onboarding';
import { TagsStep } from './tags-step';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

/**
 * The shell's contract: step 1 saves the whole list ONCE on Continue, then shows
 * step 2. No PUT without tags; no step change without a successful save.
 */
describe('Onboarding', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([Onboarding]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create(prefill: { tags: unknown[] } = { tags: [] }) {
    const fixture = TestBed.createComponent(Onboarding);
    fixture.detectChanges();
    // Prefill fires on init (step 2, hidden, fires nothing).
    expectApi(http, '/users/me/tags').flush(prefill);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function continueButton(el: HTMLElement): HTMLButtonElement {
    const button = el.querySelector('.actions .fc-submit') as HTMLButtonElement;
    if (!button) throw new Error('Continue button not found');
    return button;
  }

  it('keeps Continue disabled until at least one tag is picked', () => {
    const { el } = create();
    expect(continueButton(el).disabled).toBe(true);
    expect(el.textContent).toContain('Pick at least one interest');
  });

  it('prefills returning visitors instead of starting blank', () => {
    const { el } = create({
      tags: [{ tagId: 't1', name: 'synths', slug: 'synths', tier: 'Primary', isPublic: true }],
    });
    expect(el.textContent).toContain('synths');
    expect(el.querySelector<HTMLButtonElement>('.actions .fc-submit')!.disabled).toBe(false);
  });

  it('saves the list on Continue and advances to suggested follows', () => {
    const { fixture, el } = create();
    fixture.debugElement.query(By.directive(TagsStep)).componentInstance.add('synths', 'Primary');
    fixture.detectChanges();

    continueButton(el).click();
    const req = expectApi(http, '/users/me/tags');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      tags: [{ name: 'synths', tier: 'Primary', isPublic: true }],
    });
    req.flush(null);
    fixture.detectChanges();

    // Step 2 mounts SuggestedFollows, which immediately loads discovery — flush it.
    expectApi(http, '/feed/discovery/people').flush({ people: [] });
    fixture.detectChanges();

    expect(el.textContent).toContain('Step 2 of 2');
    expect(el.textContent).toContain('People you may like');
  });

  it('stays on step 1 with the selection intact when saving fails', () => {
    const { fixture, el } = create();
    fixture.debugElement.query(By.directive(TagsStep)).componentInstance.add('synths', 'Primary');
    fixture.detectChanges();

    continueButton(el).click();
    expectApi(http, '/users/me/tags').flush(
      [{ code: 'Tag.TooMany', description: 'Too many tags.' }],
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(el.textContent).toContain('Step 1 of 2');
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Too many tags.');
  });

  it('offers a skip to discover without saving (no PUT)', () => {
    const { el } = create();
    const skip = el.querySelector('a[href="/discover"]') as HTMLAnchorElement | null;
    expect(skip?.textContent).toContain('Skip for now');
  });

  it('returns from step 2 to step 1 via Back to interests', () => {
    const { fixture, el } = create();
    fixture.debugElement.query(By.directive(TagsStep)).componentInstance.add('synths', 'Primary');
    fixture.detectChanges();

    continueButton(el).click();
    expectApi(http, '/users/me/tags').flush(null);
    fixture.detectChanges();
    expectApi(http, '/feed/discovery/people').flush({ people: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('Step 2 of 2');

    (el.querySelector('.linklike') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.textContent).toContain('Step 1 of 2');
    expect(el.textContent).toContain('synths');
  });
});
