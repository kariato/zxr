import './style.css';
import { drawPlanPreview } from './preview.ts';
const root=document.querySelector<HTMLElement>('#review')!;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
const heading=el('h1','ZXR plan review'),message=el('p','Loading source-validated records…');message.setAttribute('role','status');
const filter=el('input');filter.placeholder='Filter rooms, assets or labels';filter.setAttribute('aria-label','Filter records');
const list=el('select');list.size=16;list.setAttribute('aria-label','Planning records');
const detail=el('section'),columns=el('div');columns.className='columns';const sidebar=el('aside');sidebar.append(filter,list);columns.append(sidebar,detail);root.append(heading,message,columns);
let records:any[]=[],selected:any,busy=false;
const control=(label:string,action:()=>void)=>{const b=el('button',label);b.type='button';b.onclick=action;return b;};
async function request(body?:unknown){const response=await fetch('/authoring/api',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:undefined);const data=await response.json();if(!response.ok)throw new Error(data.error??'Authoring request failed');return data;}
async function load(task?:any){const data=await request();records=data.records;renderList();const i=task?records.findIndex(r=>r.record.task.kind===task.kind&&r.record.task.subject===task.subject):0;list.value=String(Math.max(i,0));show();}
function renderList(){const prior=list.value;list.replaceChildren();records.forEach((r,i)=>{if((r.record.task.kind+' '+r.record.task.subject).toLowerCase().includes(filter.value.toLowerCase())){const option=el('option',r.record.task.subject+' · '+r.record.task.kind+(r.approvedCurrent?' · approved':' · review'));option.value=String(i);list.append(option);}});list.value=[...list.options].some(o=>o.value===prior)?prior:list.options[0]?.value??'';}
function show(){selected=list.value===''?undefined:records[Number(list.value)];detail.replaceChildren();if(!selected)return;const record=selected.record;
  detail.append(el('h2',record.task.subject),el('p',record.task.kind+' · '+(selected.changedFields.length?'Changed fields: '+selected.changedFields.join(', '):selected.approvedCurrent?'Matches the approved version.':'No content changes since the previous saved version.')));
  if(record.task.kind==='scene-plan'){
    const preview=el('div');preview.className='plan-preview';const previewStatus=el('p','Source-world layout test; not a GLB or a played solution.');
    const render=async(mode:string)=>{if(busy)return;busy=true;previewStatus.textContent='Preparing isolated source-world observation…';try{const data=await request({operation:'preview',room:record.task.subject,mode});drawPlanPreview(preview,data.plan,data.scene,data.current);previewStatus.textContent='Filtered source observation · '+mode+' · authoring diagram only.';}catch(e){previewStatus.textContent=String(e);}finally{busy=false;}};
    detail.append(previewStatus,preview,control('Preview source observation',()=>void render('initial')),control('Preview darkness',()=>void render('dark')));
    if(record.task.subject==='CRYPT-ROOM')detail.append(control('Disclose secret door',()=>void render('reveal')),control('Conceal secret door',()=>void render('conceal')));
  }
  const editor=el('textarea');editor.value=JSON.stringify(record.document,null,2);editor.spellcheck=false;editor.setAttribute('aria-label','Plan JSON');
  const lockLabel=el('label','Locked fields (one JSON pointer per line, e.g. /sizeMetres or /description)'),lock=el('textarea');lock.value=selected.lockedFields.join('\n');lock.rows=3;lock.setAttribute('aria-label','Locked fields');lockLabel.append(lock);
  const note=el('p','Save edits and locks together. Apply re-plan treats the JSON above as a new proposal and restores all locked values. Identity and approval metadata are supplied by the host.');
  const run=async(operation:string)=>{if(busy)return;busy=true;message.textContent='Validating against current source…';try{await request({operation,task:record.task,expectedHash:record.outputHash,document:JSON.parse(editor.value),lockedFields:lock.value.split('\n').map(s=>s.trim()).filter(Boolean)});await load(record.task);message.textContent='Saved a validated draft. Previous approval is retained; edits require fresh review.';}catch(e){message.textContent=e instanceof Error?e.message:String(e);}finally{busy=false;}};
  const reviewer=el('input');reviewer.placeholder='Reviewer name';reviewer.setAttribute('aria-label','Reviewer name');
  const approve=control('Approve saved version',()=>{if(busy)return;if(!reviewer.value.trim()){message.textContent='Enter your reviewer name.';return;}if(editor.value!==JSON.stringify(record.document,null,2)){message.textContent='Save your edits before approving.';return;}busy=true;void request({operation:'approve',task:record.task,expectedHash:record.outputHash,reviewer:reviewer.value.trim()}).then(()=>load(record.task)).then(()=>{message.textContent='Approval recorded for this exact version.';}).catch(e=>{message.textContent=String(e);}).finally(()=>{busy=false;});});
  detail.append(editor,lockLabel,note,control('Save edits and locks',()=>void run('save')),control('Apply re-plan with locks',()=>void run('replan')),reviewer,approve);
}
filter.oninput=()=>{renderList();show();};list.onchange=show;
void load().then(()=>{message.textContent='Local authoring only. Original approvals remain selected until explicitly replaced.';}).catch(e=>{message.textContent=String(e);});
