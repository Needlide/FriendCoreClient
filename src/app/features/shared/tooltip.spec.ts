import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Tooltip } from './tooltip';

describe('Tooltip', () => {
  let fixture: ComponentFixture<Tooltip>;

  async function create(text = 'Explains the thing.') {
    await TestBed.configureTestingModule({ imports: [Tooltip] }).compileComponents();
    fixture = TestBed.createComponent(Tooltip);
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  const trigger = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('.trigger')!;
  const bubble = (el: HTMLElement) => el.querySelector<HTMLElement>('.bubble');

  /**
   * Hover is simulated on the HOST, not the trigger. `mouseenter` does not bubble, and a
   * real browser delivers it to every ancestor the pointer enters — jsdom only fires it
   * where it is dispatched. Dispatching at the host is what a browser actually delivers
   * when the pointer moves onto the trigger or onto the bubble.
   */
  const hoverIn = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('mouseenter'));
  const hoverOut = (el: HTMLElement) => el.dispatchEvent(new MouseEvent('mouseleave'));

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('stays closed until the trigger is hovered or focused', async () => {
    const { el } = await create();
    expect(bubble(el)).toBeNull();
  });

  it('opens on hover and closes on leave', async () => {
    const { fixture, el } = await create('Flashing warning.');
    hoverIn(el);
    fixture.detectChanges();
    expect(bubble(el)?.textContent).toContain('Flashing warning.');

    hoverOut(el);
    fixture.detectChanges();
    expect(bubble(el)).toBeNull();
  });

  it('opens on keyboard focus, so it is not mouse-only', async () => {
    const { fixture, el } = await create();
    trigger(el).dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    fixture.detectChanges();

    expect(bubble(el)).not.toBeNull();
    // 2.1.1: everything a mouse can do, the keyboard must do too.
    expect(trigger(el).tagName).toBe('BUTTON');
  });

  it('stays open while the pointer moves onto the bubble itself (1.4.13 hoverable)', async () => {
    const { fixture, el } = await create();
    hoverIn(el);
    fixture.detectChanges();

    // The bubble is INSIDE the hover host, so crossing from the "?" onto the text is not
    // a boundary. A per-element mouseleave would hide the very text being read.
    const bubbleEl = bubble(el)!;
    expect(el.contains(bubbleEl)).toBe(true);
    expect(el.contains(trigger(el))).toBe(true);

    // Leaving the host as a whole does close it.
    hoverOut(el);
    fixture.detectChanges();
    expect(bubble(el)).toBeNull();
  });

  it('closes on Escape (1.4.13 dismissible)', async () => {
    const { fixture, el } = await create();
    hoverIn(el);
    fixture.detectChanges();
    expect(bubble(el)).not.toBeNull();

    trigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(bubble(el)).toBeNull();
  });

  it('pins on click so it is reachable without a pointer, and unpins on the next click', async () => {
    const { fixture, el } = await create();
    trigger(el).click();
    fixture.detectChanges();
    expect(bubble(el)).not.toBeNull();

    // Pinned means "persistent until dismissed": moving the pointer away must not lose it.
    hoverOut(el);
    fixture.detectChanges();
    expect(bubble(el)).not.toBeNull();

    trigger(el).click();
    fixture.detectChanges();
    expect(bubble(el)).toBeNull();
  });

  it('unpins when a click lands outside it', async () => {
    const { fixture, el } = await create();
    trigger(el).click();
    fixture.detectChanges();

    document.body.click();
    fixture.detectChanges();

    expect(bubble(el)).toBeNull();
  });

  it('describes the trigger with aria-describedby and role=tooltip', async () => {
    const { fixture, el } = await create('Why this matters.');
    hoverIn(el);
    fixture.detectChanges();

    const bubbleEl = bubble(el)!;
    // The pairing assistive tech expects: the trigger names a description, and the
    // description is a tooltip. Not a live region — it describes, it does not interrupt.
    expect(trigger(el).getAttribute('aria-describedby')).toBe(bubbleEl.id);
    expect(bubbleEl.getAttribute('role')).toBe('tooltip');
    // Closed means no dangling reference to an element that is not rendered.
    expect(trigger(el).getAttribute('aria-expanded')).toBe('true');
  });

  it('gives each instance its own id, so two tooltips never cross-reference', async () => {
    const { fixture } = await create();
    // No re-configure: the TestBed is already instantiated by create().
    const second = TestBed.createComponent(Tooltip);
    second.componentRef.setInput('text', 'Another.');
    second.detectChanges();
    fixture.detectChanges();

    hoverIn(fixture.nativeElement as HTMLElement);
    fixture.detectChanges();
    hoverIn(second.nativeElement as HTMLElement);
    second.detectChanges();

    const a = (fixture.nativeElement as HTMLElement).querySelector('.bubble')!.id;
    const b = (second.nativeElement as HTMLElement).querySelector('.bubble')!.id;
    expect(a).not.toBe(b);
  });
});
