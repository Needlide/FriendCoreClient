import { TestBed } from '@angular/core/testing';
import { TagsStep } from './tags-step';
import { configureAuthTestBed } from '../auth/test-utils';

/**
 * Pure selection state — no HTTP here (saving belongs to the onboarding shell).
 * Limits mirror the server's TagLimits; the server still gates, this just keeps
 * the UI honest before the request is ever sent.
 */
describe('TagsStep', () => {
  beforeEach(async () => {
    await configureAuthTestBed([TagsStep]);
  });

  function create() {
    const fixture = TestBed.createComponent(TagsStep);
    fixture.detectChanges();
    return { fixture, step: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
  }

  it('adds primary and secondary tags and reports them back', () => {
    const { step } = create();
    step.add('synths', 'Primary');
    step.add('baking', 'Secondary');
    expect(step.tags()).toEqual([
      { name: 'synths', tier: 'Primary', isPublic: true },
      { name: 'baking', tier: 'Secondary', isPublic: true },
    ]);
  });

  it('enforces the primary limit of 6', () => {
    const { step, el, fixture } = create();
    for (let i = 0; i < 7; i++) step.add(`tag${i}`, 'Primary');
    expect(step.tags().length).toBe(6);
    fixture.detectChanges();
    expect(el.textContent).toContain('6/6');
  });

  it('dedupes case-insensitively (the server normalizes to slugs)', () => {
    const { step } = create();
    step.add('Synths', 'Primary');
    step.add('synths', 'Secondary');
    expect(step.tags().length).toBe(1);
  });

  it('removes and toggles visibility per chip', () => {
    const { step } = create();
    step.add('synths', 'Primary');
    step.toggleVisibility('synths', 'Primary');
    expect(step.tags()[0].isPublic).toBe(false);
    step.remove('synths', 'Primary');
    expect(step.tags()).toEqual([]);
    expect(step.hasAny()).toBe(false);
  });
});
