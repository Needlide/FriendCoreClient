import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { KeywordFilters } from './keyword-filters';
import { configureAuthTestBed, expectApi } from '../auth/test-utils';

describe('KeywordFilters', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await configureAuthTestBed([KeywordFilters]);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function create() {
    const fixture = TestBed.createComponent(KeywordFilters);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function addWord(el: HTMLElement, word: string) {
    const input = el.querySelector('#kf-input') as HTMLInputElement;
    input.value = word;
    input.dispatchEvent(new Event('input'));
    el.querySelector('form')!.requestSubmit();
  }

  it('adds a word by replacing the whole set and adopts the server echo', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/keyword-filters').flush({ keywords: ['spoilers'] });
    fixture.detectChanges();

    addWord(el, '  Politics ');
    const req = expectApi(http, '/users/me/keyword-filters');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ keywords: ['spoilers', 'politics'] });
    // Server echoes its normalized set — the UI adopts it instead of its own guess.
    req.flush({ keywords: ['spoilers', 'politics'] });
    fixture.detectChanges();
    expect(el.textContent).toContain('politics');
  });

  it('removes by saving the list without the word', () => {
    const { fixture, el } = create();
    expectApi(http, '/users/me/keyword-filters').flush({ keywords: ['spoilers'] });
    fixture.detectChanges();

    const remove = el.querySelector('.chip button') as HTMLButtonElement;
    remove.click();
    const req = expectApi(http, '/users/me/keyword-filters');
    expect(req.request.body).toEqual({ keywords: [] });
    req.flush({ keywords: [] });
    fixture.detectChanges();
    expect(el.textContent).toContain('No filters yet.');
  });
});
