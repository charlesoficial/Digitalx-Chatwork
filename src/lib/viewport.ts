// The visual viewport excludes the on-screen keyboard on iOS and Android.
// Keep zoom independent of layout, and coalesce scroll/resize events per frame.
export function observeViewport() {
  const viewport = window.visualViewport;
  let frame = 0;
  const update = () => {
    frame = 0;
    if (viewport && viewport.scale !== 1) return;
    const root = document.documentElement;
    root.style.setProperty('--visible-height', `${viewport?.height ?? innerHeight}px`);
    root.style.setProperty('--visible-top', `${viewport?.offsetTop ?? 0}px`);
    root.dataset.keyboard = String(innerHeight - (viewport?.height ?? innerHeight) > 150);
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  update();
  viewport?.addEventListener('resize', schedule);
  viewport?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('pageshow', schedule);
  return () => {
    if (frame) cancelAnimationFrame(frame);
    viewport?.removeEventListener('resize', schedule);
    viewport?.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    window.removeEventListener('pageshow', schedule);
  };
}
