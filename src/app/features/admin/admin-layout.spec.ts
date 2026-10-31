import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminLayout } from './admin-layout';

describe('AdminLayout', () => {
  it('renders the section nav with all six destinations', async () => {
    await TestBed.configureTestingModule({
      imports: [AdminLayout],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminLayout);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const links = Array.from(el.querySelectorAll('.subnav a')).map((a) => a.textContent?.trim());
    expect(links).toEqual([
      'Dashboard',
      'Reports',
      'Appeals',
      'Users',
      'Tags',
      'Audit log',
    ]);
  });
});
