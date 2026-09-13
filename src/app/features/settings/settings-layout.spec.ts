import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SettingsLayout } from './settings-layout';

describe('SettingsLayout', () => {
  it('renders the section nav with all six destinations', async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsLayout],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(SettingsLayout);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const links = Array.from(el.querySelectorAll('.subnav a')).map((a) => a.textContent?.trim());
    expect(links).toEqual(['Profile', 'Interests', 'Preferences', 'Filters', 'Appeals', 'Account']);
  });
});
