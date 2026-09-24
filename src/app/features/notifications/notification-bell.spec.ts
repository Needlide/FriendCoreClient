import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotificationBell } from './notification-bell';

describe('NotificationBell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationBell],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  function create(unread: number, silencedUntil: string | null) {
    const fixture = TestBed.createComponent(NotificationBell);
    fixture.componentRef.setInput('unread', unread);
    fixture.componentRef.setInput('silencedUntil', silencedUntil);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('announces the count when unread', () => {
    const el = create(3, null);
    expect(el.querySelector('a')?.getAttribute('aria-label')).toContain('3 unread');
    expect(el.textContent).not.toContain('🔕');
  });

  it('shows the silenced state instead of the count semantics', () => {
    const el = create(0, new Date(Date.now() + 3_600_000).toISOString());
    expect(el.querySelector('a')?.getAttribute('aria-label')).toContain('silenced');
    expect(el.textContent).toContain('🔕');
  });
});
