import { expect,it,vi } from 'vitest';
import { FirstRoomNarration } from '../src/presentation/audio/first-room.ts';
const room=(id='INSIDE-BARROW',lit=true,state='input')=>({state,perception:{lit,room:{id}}});
const flush=async()=>{await Promise.resolve();await Promise.resolve();};
function fixture(){const play=vi.fn(async(current:()=>boolean)=>current()),stop=vi.fn(),status=vi.fn(),narration=new FirstRoomNarration({play,stop},status);return {play,stop,status,narration};}
it('plays once on the first visible barrow entry, never on repeated menu updates or later visits',async()=>{
  const f=fixture();f.narration.update(room('NARROW-TUNNEL'));expect(f.play).not.toHaveBeenCalled();
  f.narration.update(room());f.narration.update(room());await flush();expect(f.play).toHaveBeenCalledTimes(1);
  f.narration.update(room('NARROW-TUNNEL'));f.narration.update(room());await flush();expect(f.play).toHaveBeenCalledTimes(1);
  await f.narration.play();expect(f.play).toHaveBeenCalledTimes(2);
});
it('never starts in darkness or a non-input boundary and stops when leaving',async()=>{
  const f=fixture();for(const v of [room('INSIDE-BARROW',false),room('INSIDE-BARROW',true,'pending'),room('INSIDE-BARROW',true,'terminal')])f.narration.update(v);
  expect(f.play).not.toHaveBeenCalled();f.narration.update(room());await flush();const before=f.stop.mock.calls.length;
  f.narration.update(room('INSIDE-BARROW',false));expect(f.stop).toHaveBeenCalledTimes(before+1);
});
it('a delayed load cannot start after leaving and may retry on a later entry',async()=>{
  let current!:()=>boolean,resolve!:(started:boolean)=>void;
  const play=vi.fn((valid:()=>boolean)=>{current=valid;return new Promise<boolean>(r=>{resolve=r;});});
  const narration=new FirstRoomNarration({play,stop:vi.fn()});narration.update(room());narration.update(room('NARROW-TUNNEL'));expect(current()).toBe(false);resolve(false);await flush();
  narration.update(room());expect(play).toHaveBeenCalledTimes(2);resolve(true);await flush();
});
it('handles autoplay/load rejection without retrying on every update, and supports explicit replay',async()=>{
  const f=fixture();f.play.mockRejectedValueOnce(new Error('NotAllowedError'));f.narration.update(room());await flush();
  expect(f.status).toHaveBeenLastCalledWith(expect.stringContaining('Replay room narration'));f.narration.update(room());expect(f.play).toHaveBeenCalledTimes(1);
  await f.narration.play();expect(f.play).toHaveBeenCalledTimes(2);
});
it('muting cancels pending playback and unmuting can start the unheard narration',async()=>{
  const f=fixture();f.narration.toggleMute();f.narration.update(room());expect(f.play).not.toHaveBeenCalled();
  f.narration.toggleMute();await flush();expect(f.play).toHaveBeenCalledTimes(1);f.narration.toggleMute();await f.narration.play();expect(f.play).toHaveBeenCalledTimes(1);
});
it('teardown invalidates pending callbacks and prevents later playback',async()=>{
  const f=fixture();f.narration.update(room());const current=f.play.mock.calls[0]![0];f.narration.dispose();expect(current()).toBe(false);
  f.narration.update(room());await f.narration.play();expect(f.play).toHaveBeenCalledTimes(1);
});
