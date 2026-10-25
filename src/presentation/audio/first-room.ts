export interface NarrationPlayback {
  play(current:()=>boolean):Promise<boolean>;
  stop():void;
}
/** Presentation-only once-per-player-session narration, never a game input. */
export class FirstRoomNarration {
  #eligible=false;#played=false;#attempted=false;#muted=false;#disposed=false;#version=0;
  readonly playback:NarrationPlayback;readonly status:(text:string)=>void;
  constructor(playback:NarrationPlayback,status:(text:string)=>void=()=>{}){this.playback=playback;this.status=status;}
  get eligible(){return this.#eligible;}
  get muted(){return this.#muted;}
  update(view:{state:string;perception:{lit:boolean;room:{id:string}|null}}){
    if(this.#disposed)return;
    const eligible=view.state==='input'&&view.perception.lit&&view.perception.room?.id==='INSIDE-BARROW';
    if(!eligible&&this.#eligible){this.#version++;this.playback.stop();if(!this.#played)this.#attempted=false;this.status('');}
    this.#eligible=eligible;
    if(eligible&&!this.#muted&&!this.#attempted&&!this.#played)void this.play();
  }
  async play(){
    if(this.#disposed||!this.#eligible||this.#muted)return;
    const version=++this.#version;this.#attempted=true;this.playback.stop();this.status('Loading room narration…');
    const current=()=>!this.#disposed&&this.#eligible&&!this.#muted&&version===this.#version;
    try{const started=await this.playback.play(current);if(current()&&started){this.#played=true;this.status('Playing room narration.');}}
    catch{if(current())this.status('Automatic narration unavailable. Select Replay room narration to try again.');}
  }
  toggleMute(){
    if(this.#disposed)return;this.#muted=!this.#muted;
    if(this.#muted){this.#version++;this.playback.stop();this.status('Narration muted.');}
    else{this.status('');if(!this.#played){this.#attempted=false;if(this.#eligible)void this.play();}}
  }
  dispose(){if(this.#disposed)return;this.#disposed=true;this.#version++;this.playback.stop();}
}
