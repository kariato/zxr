import { afterEach,expect,it,vi } from 'vitest';
import { ObjectHold,objectIntent } from '../src/prototype/object-gesture.ts';
afterEach(()=>vi.useRealTimers());
it('maps mouse/pen to menus, touch to default and the left input source to menus',()=>{
  expect(objectIntent('mouse')).toBe('menu');expect(objectIntent('pen')).toBe('menu');expect(objectIntent('touch')).toBe('default');
  expect(objectIntent('','left')).toBe('menu');expect(objectIntent('','right')).toBe('default');expect(objectIntent('','none')).toBe('default');
});
it('opens on a touch hold once and consumes release',()=>{
  vi.useFakeTimers();const hold=new ObjectHold(),open=vi.fn();hold.start(open);
  vi.advanceTimersByTime(549);expect(open).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(open).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(2000);expect(open).toHaveBeenCalledTimes(1);expect(hold.release()).toBe(true);expect(hold.release()).toBe(false);
});
it('short taps, movement/multi-touch cancellation and teardown never fire a delayed menu',()=>{
  vi.useFakeTimers();const hold=new ObjectHold(),open=vi.fn();hold.start(open);vi.advanceTimersByTime(200);expect(hold.release()).toBe(false);
  hold.start(open);hold.cancel();vi.runAllTimers();expect(open).not.toHaveBeenCalled();
  hold.start(open);hold.start(open);vi.runAllTimers();expect(open).toHaveBeenCalledTimes(1);
});
