import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownToLine, AudioLines, BoxSelect, ChevronDown, ChevronRight, Circle, CircleDot, Code2,
  Eye, EyeOff, Grid3X3, Group as GroupIcon, Hand, Layers3, Link2, MousePointer2, Move, Pause,
  Play, Plus, RectangleHorizontal, Redo2, RotateCcw, Route, Settings2, Sparkles, SquareDashedMousePointer,
  Trash2, Ungroup, Volume2, Waves, X, Zap
} from 'lucide-react';
import type { AppState, Composition, Field, FieldKind, Group, Mapping, PathDef, Selection, Shape, SourceId, Tool } from './types';

const OUTPUT = { x: 90, y: 60, w: 960, h: 600 };
const sourceMeta: Record<SourceId, { label: string; range: string; sequence?: boolean; color: string }> = {
  pitch: { label: '音高', range: '36—84', color: '#b8ff46' }, velocity: { label: '力度', range: '0—1', color: '#ffdb57' },
  duration: { label: '时值', range: '0—1', color: '#ff9e72' }, pan: { label: '声像', range: '-1—1', color: '#75d8ff' },
  event: { label: '声部事件', range: '0 / 1', color: '#da9cff' }, spectrum: { label: '完整频谱', range: '0—1 × 32', sequence: true, color: '#79f3d0' }
};
const compLabels: Record<Composition, string> = { none: '无构成', horizontal: '水平', vertical: '垂直', grid: '网格', radial: '环形', path: '沿路径', random: '随机' };
const initialShapes: Shape[] = [
  { id:'s1', kind:'circle', name:'圆形 01', x:310,y:280,width:88,height:88,rotation:0,fill:'#b8ff46',opacity:1,created:1 },
  { id:'s2', kind:'rect', name:'矩形 01', x:488,y:256,width:128,height:76,rotation:-8,fill:'#775cff',opacity:1,created:2 },
  { id:'s3', kind:'circle', name:'圆形 02', x:700,y:315,width:64,height:64,rotation:0,fill:'#ff6b57',opacity:.9,created:3 }
];
const initialState: AppState = { shapes: initialShapes, groups: [], fields: [], mappings: [] };
const uid = (p:string) => `${p}_${Math.random().toString(36).slice(2,8)}`;
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));

function App() {
  const [state,setStateRaw]=useState<AppState>(initialState);
  const [history,setHistory]=useState<AppState[]>([]);
  const [selection,setSelection]=useState<Selection[]>([]);
  const [tool,setTool]=useState<Tool>('select');
  const [zoom,setZoom]=useState(.82); const [pan,setPan]=useState({x:20,y:24});
  const [playing,setPlaying]=useState(false); const [bpm,setBpm]=useState(120); const [clean,setClean]=useState(false);
  const [soundOpen,setSoundOpen]=useState(true); const [monitorMode,setMonitorMode]=useState<'spectrum'|'event'>('spectrum');
  const [tick,setTick]=useState(0); const [activeMap,setActiveMap]=useState<string>(); const [dragSource,setDragSource]=useState<SourceId>();
  const [code,setCode]=useState(`stack(\n  note("c3 eb3 g3 bb3").slow(2)\n    .s("sawtooth").gain(.42),\n  s("bd ~ bd [~ bd]").bank("tr909")\n)`);
  const canvasRef=useRef<SVGSVGElement>(null); const audioRef=useRef<AudioContext | undefined>(undefined);
  const interaction=useRef<{type:string; start:{x:number;y:number}; ids?:string[]; base?:Record<string,{x:number;y:number}>; current?:{x:number;y:number}} | undefined>(undefined);
  const space=useRef(false);

  const setState=useCallback((updater:(s:AppState)=>AppState, record=true)=>{
    setStateRaw(prev=>{ const next=updater(prev); if(record) setHistory(h=>[...h.slice(-39),prev]); return next; });
  },[]);
  const undo=useCallback(()=>{ setHistory(h=>{ if(!h.length)return h; setStateRaw(h[h.length-1]); return h.slice(0,-1); });},[]);

  useEffect(()=>{ if(!playing)return; const ms=60000/bpm/4; const id=window.setInterval(()=>setTick(t=>t+1),ms); return()=>clearInterval(id);},[playing,bpm]);
  useEffect(()=>{
    const down=(e:KeyboardEvent)=>{ if((e.target as HTMLElement).matches('textarea,input'))return; if(e.code==='Space'){space.current=true;e.preventDefault()}
      if(e.key==='Escape'){setClean(false);setSelection([])} if((e.metaKey||e.ctrlKey)&&e.key==='z'){e.preventDefault();undo()}
      if((e.key==='Delete'||e.key==='Backspace')&&selection.length) deleteSelected();
      if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();togglePlay()}
    }; const up=(e:KeyboardEvent)=>{if(e.code==='Space')space.current=false};
    window.addEventListener('keydown',down);window.addEventListener('keyup',up);return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up)};
  });

  const audioValues=useMemo(()=>{
    const phase=tick*.43; const spectrum=Array.from({length:32},(_,i)=>clamp(.08+Math.abs(Math.sin(phase*.32+i*.47))*.72*(1-i/46)+Math.sin(phase+i)*.08,0,1));
    return {pitch:48+Math.round((Math.sin(phase)+1)*12),velocity:.45+Math.sin(phase*1.7)*.35,duration:.35+Math.cos(phase*.6)*.22,pan:Math.sin(phase*.4),event:tick%4===0?1:0,spectrum};
  },[tick]);
  const currentValue=(m:Mapping)=>{let n=m.source==='spectrum'?audioValues.spectrum[0]:audioValues[m.source] as number;
    const range=sourceMeta[m.source].range; let normalized=m.source==='pitch'?(n-36)/48:m.source==='pan'?(n+1)/2:n; if(m.reverse)normalized=1-normalized;
    return m.base+m.min+(m.max-m.min)*normalized+(range?0:0);
  };

  const togglePlay=()=>{ setPlaying(p=>{const next=!p;if(next){ const AC=window.AudioContext||(window as any).webkitAudioContext; if(AC&&!audioRef.current)audioRef.current=new AC(); audioRef.current?.resume(); playBlip(); } return next})};
  const playBlip=()=>{const c=audioRef.current;if(!c)return;const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=130.81*Math.pow(2,(tick%8)/12);g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.06,c.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.14);o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.15)};
  useEffect(()=>{if(playing&&tick%2===0)playBlip()},[tick]);

  const selectedShapes=selection.filter(s=>s.kind==='shape').map(s=>state.shapes.find(x=>x.id===s.id)).filter(Boolean) as Shape[];
  const selectedGroup=selection.length===1&&selection[0].kind==='group'?state.groups.find(g=>g.id===selection[0].id):undefined;
  const selectedField=selection.length===1&&selection[0].kind==='field'?state.fields.find(f=>f.id===selection[0].id):undefined;

  const getPoint=(e:React.PointerEvent)=>{const r=canvasRef.current!.getBoundingClientRect();return{x:(e.clientX-r.left-pan.x)/zoom,y:(e.clientY-r.top-pan.y)/zoom}};
  const onCanvasDown=(e:React.PointerEvent)=>{if(e.button===1||space.current){interaction.current={type:'pan',start:{x:e.clientX-pan.x,y:e.clientY-pan.y}};(e.currentTarget as Element).setPointerCapture(e.pointerId);return}
    const p=getPoint(e); if(tool==='circle'||tool==='rect'||tool==='line'){const id=uid('s');const shape:Shape={id,kind:tool,name:`${tool==='circle'?'圆形':tool==='rect'?'矩形':'直线'} ${state.shapes.length+1}`,x:p.x,y:p.y,width:1,height:1,rotation:0,fill:tool==='line'?'#dce5ee':'#b8ff46',stroke:tool==='line'?'#b8ff46':undefined,opacity:1,created:Date.now()};setState(s=>({...s,shapes:[...s.shapes,shape]}));setSelection([{kind:'shape',id}]);interaction.current={type:'draw',start:p,ids:[id]};(e.currentTarget as Element).setPointerCapture(e.pointerId);return}
    setSelection([]);interaction.current={type:'marquee',start:p,current:p};(e.currentTarget as Element).setPointerCapture(e.pointerId)};
  const onShapeDown=(e:React.PointerEvent,id:string)=>{if(tool!=='select'||space.current)return;e.stopPropagation();const p=getPoint(e);let next=selection;if(e.shiftKey){next=selection.some(s=>s.kind==='shape'&&s.id===id)?selection.filter(s=>s.id!==id):[...selection,{kind:'shape',id} as Selection]}else if(!selection.some(s=>s.kind==='shape'&&s.id===id))next=[{kind:'shape',id}];setSelection(next);const ids=next.filter(s=>s.kind==='shape').map(s=>s.id);const base:Object=Object.fromEntries(state.shapes.filter(s=>ids.includes(s.id)).map(s=>[s.id,{x:s.x,y:s.y}]));interaction.current={type:'move',start:p,ids,base:base as any};(e.currentTarget as Element).setPointerCapture(e.pointerId)};
  const onMove=(e:React.PointerEvent)=>{const a=interaction.current;if(!a)return;if(a.type==='pan'){setPan({x:e.clientX-a.start.x,y:e.clientY-a.start.y});return}const p=getPoint(e);if(a.type==='draw'){const id=a.ids![0],dx=p.x-a.start.x,dy=p.y-a.start.y;setStateRaw(s=>({...s,shapes:s.shapes.map(x=>x.id===id?{...x,x:dx<0?p.x:a.start.x,y:dy<0?p.y:a.start.y,width:Math.max(4,Math.abs(dx)),height:x.kind==='line'?Math.max(3,Math.abs(dy)):Math.max(4,Math.abs(dy))}:x)}))}
    if(a.type==='move'){const dx=p.x-a.start.x,dy=p.y-a.start.y;setStateRaw(s=>({...s,shapes:s.shapes.map(x=>a.ids!.includes(x.id)?{...x,x:a.base![x.id].x+dx,y:a.base![x.id].y+dy}:x)}))}
    if(a.type==='marquee'){a.current=p;setTick(t=>t)} };
  const onUp=()=>{const a=interaction.current;if(a?.type==='marquee'&&a.current){const x=Math.min(a.start.x,a.current.x),y=Math.min(a.start.y,a.current.y),w=Math.abs(a.current.x-a.start.x),h=Math.abs(a.current.y-a.start.y);setSelection(state.shapes.filter(s=>!s.hidden&&s.x>=x&&s.y>=y&&s.x+s.width<=x+w&&s.y+s.height<=y+h).map(s=>({kind:'shape',id:s.id})))}interaction.current=undefined};
  const wheel=(e:React.WheelEvent)=>{e.preventDefault();const factor=e.deltaY>0?.9:1.1;setZoom(z=>clamp(z*factor,.25,2.4))};

  const deleteSelected=()=>setState(s=>{const shapeIds=selection.filter(x=>x.kind==='shape').map(x=>x.id),groupIds=selection.filter(x=>x.kind==='group').map(x=>x.id),fieldIds=selection.filter(x=>x.kind==='field').map(x=>x.id);setSelection([]);return{shapes:s.shapes.filter(x=>!shapeIds.includes(x.id)&&!groupIds.includes(x.groupId||'')),groups:s.groups.filter(x=>!groupIds.includes(x.id)).map(g=>({...g,memberIds:g.memberIds.filter(id=>!shapeIds.includes(id))})),fields:s.fields.filter(x=>!fieldIds.includes(x.id)),mappings:s.mappings.filter(m=>!shapeIds.includes(m.targetId)&&!groupIds.includes(m.targetId)&&!fieldIds.includes(m.targetId))}});
  const groupSelection=()=>{if(selectedShapes.length<2)return;const id=uid('g'),sorted=[...selectedShapes].sort((a,b)=>a.created-b.created);const group:Group={id,name:`元素组 ${state.groups.length+1}`,memberIds:sorted.map(s=>s.id),composition:'none',count:sorted.length,spacing:116,radius:150,columns:3,offset:0,reverse:false,perspective:false,perspectiveStrength:.45,seed:17};setState(s=>({...s,groups:[...s.groups,group],shapes:s.shapes.map(x=>group.memberIds.includes(x.id)?{...x,groupId:id}:x)}));setSelection([{kind:'group',id}])};
  const ungroup=()=>{if(!selectedGroup)return;if(state.mappings.some(m=>m.targetId===selectedGroup.id)&&!confirm('解组会删除组级映射，是否继续？'))return;const ids=selectedGroup.memberIds;setState(s=>({...s,shapes:s.shapes.map(x=>ids.includes(x.id)?{...x,groupId:undefined,instance:false,hidden:false}:x),groups:s.groups.filter(g=>g.id!==selectedGroup.id),mappings:s.mappings.filter(m=>m.targetId!==selectedGroup.id)}));setSelection(ids.map(id=>({kind:'shape',id})))};

  const arrangeGroup=(g:Group, shapes:Shape[])=>{const members=g.memberIds.map(id=>shapes.find(s=>s.id===id)).filter(Boolean) as Shape[];if(!members.length)return shapes;const origin=members[0],list=g.reverse?[...members].reverse():members;return shapes.map(s=>{const i=list.findIndex(x=>x.id===s.id);if(i<0)return s;let x=s.x,y=s.y,rotation=s.rotation;const n=Math.max(1,list.length);if(g.composition==='horizontal'){x=origin.x+i*g.spacing;y=origin.y}
    if(g.composition==='vertical'){x=origin.x;y=origin.y+i*g.spacing}
    if(g.composition==='grid'){x=origin.x+(i%g.columns)*g.spacing;y=origin.y+Math.floor(i/g.columns)*g.spacing}
    if(g.composition==='radial'){const a=(g.offset+i*360/n)*Math.PI/180;x=OUTPUT.x+OUTPUT.w/2+Math.cos(a)*g.radius-s.width/2;y=OUTPUT.y+OUTPUT.h/2+Math.sin(a)*g.radius-s.height/2;rotation=g.offset+i*360/n+90}
    if(g.composition==='path'){x=origin.x+i*(g.spacing*.8);y=origin.y+Math.sin(i/(n-1||1)*Math.PI)*-g.radius*.45;rotation=-18+36*i/(n-1||1)}
    if(g.composition==='random'){const r1=Math.sin((i+1)*g.seed*12.9898)*43758.5453,r2=Math.sin((i+1)*g.seed*78.233)*12345.678;x=OUTPUT.x+40+(r1-Math.floor(r1))*(OUTPUT.w-120);y=OUTPUT.y+40+(r2-Math.floor(r2))*(OUTPUT.h-120)}
    if(g.perspective){const cx=OUTPUT.x+OUTPUT.w/2,cy=OUTPUT.y+OUTPUT.h/2,d=Math.hypot(x-cx,y-cy)/Math.hypot(OUTPUT.w/2,OUTPUT.h/2),scale=clamp(1+(1-d)*g.perspectiveStrength,.3,2);return{...s,x,y,rotation,width:s.width*scale,height:s.height*scale}}return{...s,x,y,rotation}})};
  const patchGroup=(p:Partial<Group>)=>{if(!selectedGroup)return;setState(s=>{const groups=s.groups.map(g=>g.id===selectedGroup.id?{...g,...p}:g);const g=groups.find(g=>g.id===selectedGroup.id)!;return{...s,groups,shapes:arrangeGroup(g,s.shapes)}})};
  const setCount=(count:number)=>{if(!selectedGroup)return;setState(s=>{let shapes=[...s.shapes],ids=[...selectedGroup.memberIds];const proto=shapes.find(x=>x.id===ids[0])!;while(ids.length<count){const id=uid('i');ids.push(id);shapes.push({...proto,id,name:`${proto.name} · 实例 ${ids.length-1}`,instance:true,groupId:selectedGroup.id,created:Date.now()+ids.length})}shapes=shapes.map(x=>ids.includes(x.id)?{...x,hidden:ids.indexOf(x.id)>=count}:x);const groups=s.groups.map(g=>g.id===selectedGroup.id?{...g,count,memberIds:ids}:g);return{...s,groups,shapes:arrangeGroup(groups.find(g=>g.id===selectedGroup.id)!,shapes)}})};

  const addPath=()=>{if(!selectedGroup&&selectedShapes.length!==1)return;const path:PathDef={kind:'bezier',x:240,y:210,length:560,radius:160,offset:0,orientation:true,angleOffset:0,loop:false};if(selectedGroup)patchGroup({path});else setState(s=>({...s,shapes:s.shapes,mappings:s.mappings}),false)};
  const addField=()=>{const id=uid('f'),f:Field={id,name:`移动影响 ${state.fields.length+1}`,kind:'attract',x:OUTPUT.x+OUTPUT.w/2,y:OUTPUT.y+OUTPUT.h/2,radius:180,strength:24,direction:0,falloff:'radial'};setState(s=>({...s,fields:[...s.fields,f]}));setSelection([{kind:'field',id}])};
  const patchField=(p:Partial<Field>)=>{if(!selectedField)return;setState(s=>({...s,fields:s.fields.map(f=>f.id===selectedField.id?{...f,...p}:f)}))};
  const createMapping=(source:SourceId,targetKind:Mapping['targetKind'],targetId:string,property:string,base:number)=>{const id=uid('m'),m:Mapping={id,source,targetKind,targetId,property,base,min:-1,max:1,enabled:true,reverse:false,sampling:'average'};setState(s=>({...s,mappings:[...s.mappings,m]}));setActiveMap(id);setDragSource(undefined)};
  const onPropDrop=(targetKind:Mapping['targetKind'],targetId:string,property:string,base:number)=>(e:React.DragEvent)=>{e.preventDefault();const src=(e.dataTransfer.getData('source')||dragSource) as SourceId;if(!src)return;if(src==='spectrum'&&targetKind!=='members')return;createMapping(src,targetKind,targetId,property,base)};
  const patchMapping=(id:string,p:Partial<Mapping>)=>setState(s=>({...s,mappings:s.mappings.map(m=>m.id===id?{...m,...p}:m)}));

  const renderedShapes=useMemo(() => state.shapes.map(shape => {
    const out = { ...shape };
    for (const mapping of state.mappings.filter(m => m.enabled && m.targetId === shape.id)) {
      const value = currentValue(mapping);
      if (mapping.property === 'x') out.x = value;
      if (mapping.property === 'y') out.y = value;
      if (mapping.property === 'rotation') out.rotation = value;
      if (mapping.property === 'opacity') out.opacity = clamp(value, 0, 1);
      if (mapping.property === 'scale') {
        out.width = shape.width * clamp(value, .1, 4);
        out.height = shape.height * clamp(value, .1, 4);
      }
    }
    const group = shape.groupId ? state.groups.find(g => g.id === shape.groupId) : undefined;
    if (group) {
      const memberMaps = state.mappings.filter(m => m.enabled && m.targetId === group.id && m.targetKind === 'members');
      const ordered = group.reverse ? [...group.memberIds].reverse() : group.memberIds;
      const index = ordered.indexOf(shape.id);
      const count = ordered.length;
      for (const mapping of memberMaps) {
        const position = count <= 1 ? 0 : index * (audioValues.spectrum.length - 1) / (count - 1);
        const low = Math.floor(position);
        const high = Math.ceil(position);
        const start = Math.floor(index * 32 / count);
        const end = Math.max(Math.floor((index + 1) * 32 / count), start + 1);
        const sample = mapping.sampling === 'peak'
          ? Math.max(...audioValues.spectrum.slice(start, end))
          : audioValues.spectrum[low] * (high - position) + audioValues.spectrum[high] * (position - low);
        const value = mapping.base + mapping.min + (mapping.max - mapping.min) * sample;
        if (mapping.property === 'scaleY') out.height = shape.height * clamp(value, .08, 8);
        if (mapping.property === 'scaleX') out.width = shape.width * clamp(value, .08, 8);
        if (mapping.property === 'rotation') out.rotation = value;
        if (mapping.property === 'y') out.y = value;
        if (mapping.property === 'opacity') out.opacity = clamp(value, 0, 1);
      }
    }
    for (const field of state.fields) {
      const cx = out.x + out.width / 2;
      const cy = out.y + out.height / 2;
      const dx = field.x - cx;
      const dy = field.y - cy;
      const distance = Math.hypot(dx, dy);
      if (distance < field.radius) {
        const falloff = field.falloff === 'uniform' ? 1 : 1 - distance / field.radius;
        const sign = field.kind === 'repel' ? -1 : 1;
        if (field.kind === 'directional') {
          out.x += Math.cos(field.direction * Math.PI / 180) * field.strength * falloff;
          out.y += Math.sin(field.direction * Math.PI / 180) * field.strength * falloff;
        } else {
          out.x += dx / (distance || 1) * field.strength * falloff * sign;
          out.y += dy / (distance || 1) * field.strength * falloff * sign;
        }
      }
    }
    return out;
  }), [state, audioValues]);
  const marquee=interaction.current?.type==='marquee'&&interaction.current.current?interaction.current:null;

  return <div className={`app ${clean?'clean':''}`}>
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><AudioLines size={19}/></div><strong>SONIC CANVAS</strong><span className="beta">BETA</span></div>
      <div className="transport"><label>BPM <input value={bpm} onChange={e=>setBpm(+e.target.value)} /></label><button className={`play ${playing?'active':''}`} onClick={togglePlay}>{playing?<Pause size={16}/>:<Play size={16}/>} {playing?'暂停':'播放'}</button><span className="shortcut">⌘ ↵</span></div>
      <div className="top-actions"><button onClick={()=>setClean(true)}><Eye size={16}/> 纯净视图</button><button onClick={()=>{if(confirm('清空全部画布内容？')){setState(()=>({shapes:[],groups:[],fields:[],mappings:[]}));setSelection([])}}}><Trash2 size={15}/> 清空画布</button></div>
    </header>
    {clean&&<button className="exit-clean" onClick={()=>setClean(false)}><X size={16}/> 退出纯净视图 <kbd>Esc</kbd></button>}
    <aside className="left-panel panel">
      <PanelTitle icon={<Layers3 size={15}/>} title="场景" action={<button className="icon-btn" onClick={addField}><Plus size={15}/></button>}/>
      <div className="toolbox">
        {([['select',MousePointer2,'选择'],['circle',Circle,'圆'],['rect',RectangleHorizontal,'矩形'],['line',ArrowDownToLine,'直线']] as const).map(([id,I,label])=><button key={id} className={tool===id?'active':''} onClick={()=>setTool(id)}><I size={17}/><span>{label}</span></button>)}
      </div>
      <div className="layer-tree">
        <div className="tree-root"><ChevronDown size={14}/><div className="layer-icon"><BoxSelect size={14}/></div><strong>输出画布</strong><span>{state.shapes.filter(s=>!s.hidden).length}</span></div>
        <div className="tree-children">
          {state.groups.map(g=><div key={g.id} className={`layer-row ${selection.some(s=>s.id===g.id)?'selected':''}`} onClick={()=>setSelection([{kind:'group',id:g.id}])}><ChevronRight size={13}/><GroupIcon size={14}/><span>{g.name}</span><em>{g.memberIds.filter(id=>!state.shapes.find(s=>s.id===id)?.hidden).length}</em></div>)}
          {state.shapes.filter(s=>!s.groupId&&!s.hidden).map(s=><div key={s.id} className={`layer-row ${selection.some(x=>x.id===s.id)?'selected':''}`} onClick={()=>setSelection([{kind:'shape',id:s.id}])}><span className="indent"/>{s.kind==='circle'?<Circle size={13}/>:s.kind==='rect'?<RectangleHorizontal size={13}/>:<ArrowDownToLine size={13}/>}<span>{s.name}</span>{s.instance&&<i className="instance-tag">实例</i>}</div>)}
        </div>
      </div>
      <SectionLabel label="移动影响层" count={state.fields.length} action={<button className="mini-add" onClick={addField}><Plus size={13}/> 新建</button>}/>
      {state.fields.map(f=><div className={`field-row ${selection.some(s=>s.id===f.id)?'selected':''}`} key={f.id} onClick={()=>setSelection([{kind:'field',id:f.id}])}><div className="field-dot"><Move size={13}/></div><span>{f.name}</span><small>{f.kind==='attract'?'吸引':f.kind==='repel'?'排斥':'定向'}</small></div>)}
      <SectionLabel label="映射关系" count={state.mappings.length}/>
      <div className="mapping-list">{state.mappings.length===0&&<div className="empty-map"><Link2 size={20}/><span>拖拽声音参数到属性<br/>建立第一条映射</span></div>}{state.mappings.map(m=><MappingCard key={m.id} m={m} active={activeMap===m.id} value={currentValue(m)} state={state} patch={patchMapping} remove={()=>setState(s=>({...s,mappings:s.mappings.filter(x=>x.id!==m.id)}))}/>)}</div>
    </aside>
    <main className="stage-wrap">
      <div className="stage-status"><span><i className={playing?'live':''}/> {playing?'LIVE · 声音驱动中':'READY · 等待播放'}</span><span>{Math.round(zoom*100)}%</span></div>
      <svg ref={canvasRef} className="stage" onPointerDown={onCanvasDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={wheel}>
        <defs><pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#8290a0" opacity=".22"/></pattern><clipPath id="outputClip"><rect x={OUTPUT.x} y={OUTPUT.y} width={OUTPUT.w} height={OUTPUT.h}/></clipPath></defs>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          <rect x={-1000} y={-1000} width={4000} height={3000} fill="url(#dots)"/>
          <rect className="output-shadow" x={OUTPUT.x} y={OUTPUT.y} width={OUTPUT.w} height={OUTPUT.h}/><rect className="output-bg" x={OUTPUT.x} y={OUTPUT.y} width={OUTPUT.w} height={OUTPUT.h}/><text x={OUTPUT.x} y={OUTPUT.y-14} className="frame-label">OUTPUT · 16:10</text>
          <g clipPath="url(#outputClip)">{renderedShapes.filter(s=>!s.hidden).map(s=><ShapeNode key={s.id} shape={s} selected={!clean&&selection.some(x=>x.kind==='shape'&&x.id===s.id)} bound={state.mappings.some(m=>m.targetId===s.id)||!!s.groupId&&state.mappings.some(m=>m.targetId===s.groupId)} onDown={e=>onShapeDown(e,s.id)}/>)}</g>
          {!clean&&selectedGroup?.path&&<PathGuide path={selectedGroup.path}/>} 
          {!clean&&selectedField&&<FieldGuide field={selectedField}/>} 
          {!clean&&selectedGroup&&<GroupBounds group={selectedGroup} shapes={renderedShapes}/>} 
          {!clean&&marquee&&<rect className="marquee" x={Math.min(marquee.start.x,marquee.current!.x)} y={Math.min(marquee.start.y,marquee.current!.y)} width={Math.abs(marquee.current!.x-marquee.start.x)} height={Math.abs(marquee.current!.y-marquee.start.y)}/>} 
        </g>
      </svg>
      <div className="canvas-tools"><button className={tool==='select'?'active':''} onClick={()=>setTool('select')}><MousePointer2 size={16}/></button><button onClick={()=>space.current=!space.current}><Hand size={16}/></button><span/><button onClick={()=>setZoom(z=>clamp(z-.1,.25,2.4))}>−</button><button onClick={()=>{setZoom(.82);setPan({x:20,y:24})}}>{Math.round(zoom*100)}%</button><button onClick={()=>setZoom(z=>clamp(z+.1,.25,2.4))}>＋</button></div>
    </main>
    <aside className="right-panel panel"><Inspector state={state} selectedShapes={selectedShapes} group={selectedGroup} field={selectedField} mappings={state.mappings} patchShape={(id,p)=>setState(s=>({...s,shapes:s.shapes.map(x=>x.id===id?{...x,...p}:x)}))} groupSelection={groupSelection} ungroup={ungroup} patchGroup={patchGroup} setCount={setCount} addPath={addPath} patchField={patchField} onDrop={onPropDrop} setActiveMap={setActiveMap}/></aside>
    <section className={`sound-dock ${soundOpen?'open':''}`}>
      <button className="dock-handle" onClick={()=>setSoundOpen(o=>!o)}><div><Volume2 size={15}/><strong>声音工作区</strong>{playing&&<span className="live-pill">LIVE</span>}</div><ChevronDown size={16}/></button>
      <div className="sound-content">
        <div className="sound-sources"><div className="sound-title"><Waves size={15}/><span>可映射参数</span><small>拖到右侧属性</small></div><div className="source-grid">{(Object.keys(sourceMeta) as SourceId[]).map(id=><div key={id} className={`source-chip ${sourceMeta[id].sequence?'sequence':''}`} draggable onDragStart={e=>{e.dataTransfer.setData('source',id);setDragSource(id)}} onDragEnd={()=>setDragSource(undefined)}><i style={{background:sourceMeta[id].color}}/><span><b>{sourceMeta[id].label}</b><small>{sourceMeta[id].range}</small></span><Move size={13}/></div>)}</div></div>
        <div className="code-editor"><div className="editor-head"><div><Code2 size={14}/> STRUDEL</div><span>main.strudel</span></div><div className="editor-body"><div className="line-nums">1<br/>2<br/>3<br/>4</div><textarea spellCheck={false} value={code} onChange={e=>setCode(e.target.value)}/></div></div>
        <div className="monitor"><div className="monitor-head"><span>声音监控台</span><div><button className={monitorMode==='spectrum'?'active':''} onClick={()=>setMonitorMode('spectrum')}>频谱</button><button className={monitorMode==='event'?'active':''} onClick={()=>setMonitorMode('event')}>MIDI / 事件</button></div></div>{monitorMode==='spectrum'?<div className="spectrum">{audioValues.spectrum.map((v,i)=><i key={i} style={{height:`${8+v*72}px`,opacity:playing?1:.28}}/>)}</div>:<div className="event-grid"><Metric label="声部" value="VOICE 01"/><Metric label="音高" value={`${audioValues.pitch} · C3`}/><Metric label="力度" value={audioValues.velocity.toFixed(2)}/><Metric label="事件" value={audioValues.event?'ON':'—'}/></div>}</div>
      </div>
    </section>
  </div>
}

function PanelTitle({icon,title,action}:{icon:React.ReactNode;title:string;action?:React.ReactNode}){return <div className="panel-title"><div>{icon}<span>{title}</span></div>{action}</div>}
function SectionLabel({label,count,action}:{label:string;count:number;action?:React.ReactNode}){return <div className="section-label"><span>{label}</span><b>{count}</b>{action}</div>}
function Metric({label,value}:{label:string;value:string}){return <div><small>{label}</small><b>{value}</b></div>}
function ShapeNode({shape:s,selected,bound,onDown}:{shape:Shape;selected:boolean;bound:boolean;onDown:(e:React.PointerEvent)=>void}){const cx=s.x+s.width/2,cy=s.y+s.height/2;return <g onPointerDown={onDown} className={`shape-node ${selected?'selected':''} ${bound?'bound':''}`} transform={`rotate(${s.rotation} ${cx} ${cy})`}>
  {s.kind==='circle'?<ellipse cx={cx} cy={cy} rx={s.width/2} ry={s.height/2} fill={s.fill} opacity={s.opacity}/>:s.kind==='rect'?<rect x={s.x} y={s.y} width={s.width} height={s.height} rx={10} fill={s.fill} opacity={s.opacity}/>:<line x1={s.x} y1={s.y} x2={s.x+s.width} y2={s.y+s.height} stroke={s.stroke||s.fill} strokeWidth={5} strokeLinecap="round" opacity={s.opacity}/>} {selected&&<><rect className="select-box" x={s.x-5} y={s.y-5} width={s.width+10} height={s.height+10}/>{[[s.x-5,s.y-5],[s.x+s.width+5,s.y-5],[s.x-5,s.y+s.height+5],[s.x+s.width+5,s.y+s.height+5]].map(([x,y],i)=><rect key={i} className="handle" x={x-4} y={y-4} width={8} height={8}/>)}<line className="rotation-line" x1={cx} y1={s.y-5} x2={cx} y2={s.y-29}/><circle className="rotation-handle" cx={cx} cy={s.y-34} r={5}/></>}</g>}
function GroupBounds({group,shapes}:{group:Group;shapes:Shape[]}){const m=shapes.filter(s=>group.memberIds.includes(s.id)&&!s.hidden);if(!m.length)return null;const x=Math.min(...m.map(s=>s.x)),y=Math.min(...m.map(s=>s.y)),x2=Math.max(...m.map(s=>s.x+s.width)),y2=Math.max(...m.map(s=>s.y+s.height));return <g><rect className="group-bounds" x={x-14} y={y-14} width={x2-x+28} height={y2-y+28}/><g transform={`translate(${x-14},${y-38})`}><rect className="group-label-bg" width="104" height="22" rx="5"/><text className="group-label" x="9" y="15">{group.name}</text></g></g>}
function PathGuide({path:p}:{path:PathDef}){return <g className="path-guide"><path d={`M ${p.x} ${p.y+p.radius/2} C ${p.x+p.length*.28} ${p.y-p.radius}, ${p.x+p.length*.68} ${p.y+p.radius*1.6}, ${p.x+p.length} ${p.y}`} /><circle cx={p.x} cy={p.y+p.radius/2} r="5"/><circle cx={p.x+p.length} cy={p.y} r="5"/></g>}
function FieldGuide({field:f}:{field:Field}){const ex=f.x+Math.cos(f.direction*Math.PI/180)*f.radius*.65,ey=f.y+Math.sin(f.direction*Math.PI/180)*f.radius*.65;return <g className="field-guide"><circle cx={f.x} cy={f.y} r={f.radius}/><circle cx={f.x} cy={f.y} r="6"/><line x1={f.x} y1={f.y} x2={ex} y2={ey}/><path d={`M ${ex} ${ey} l -14 -6 l 4 13 z`} transform={`rotate(${f.direction} ${ex} ${ey})`}/><text x={f.x-f.radius} y={f.y-f.radius-10}>{f.name} · {f.strength}</text></g>}

function Inspector({state,selectedShapes,group,field,mappings,patchShape,groupSelection,ungroup,patchGroup,setCount,addPath,patchField,onDrop,setActiveMap}:{state:AppState;selectedShapes:Shape[];group?:Group;field?:Field;mappings:Mapping[];patchShape:(id:string,p:Partial<Shape>)=>void;groupSelection:()=>void;ungroup:()=>void;patchGroup:(p:Partial<Group>)=>void;setCount:(n:number)=>void;addPath:()=>void;patchField:(p:Partial<Field>)=>void;onDrop:(k:Mapping['targetKind'],id:string,p:string,b:number)=>(e:React.DragEvent)=>void;setActiveMap:(id:string)=>void}){
  if(selectedShapes.length>1)return <><PanelTitle icon={<Settings2 size={15}/>} title="多选属性"/><div className="selection-summary"><div className="multi-icons">{selectedShapes.slice(0,4).map((s,i)=><span key={s.id} style={{background:s.fill,transform:`translateX(${-i*6}px)`}}/> )}</div><b>已选择 {selectedShapes.length} 个元素</b><small>将元素组合后可设置构成、成员顺序与序列映射。</small><button className="primary wide" onClick={groupSelection}><GroupIcon size={15}/> 建立元素组</button></div><InfoBlock/></>;
  if(group)return <><PanelTitle icon={<GroupIcon size={15}/>} title="元素组" action={<button className="icon-btn" onClick={ungroup}><Ungroup size={15}/></button>}/><InspectorHeader title={group.name} type={`${group.memberIds.length} 个成员 · 非嵌套组`} color="#775cff"/>
    <Fold title="构成关系" badge={compLabels[group.composition]}><div className="comp-grid">{(Object.keys(compLabels) as Composition[]).map(c=><button key={c} className={group.composition===c?'active':''} onClick={()=>patchGroup({composition:c})}>{c==='horizontal'?'↔':c==='vertical'?'↕':c==='grid'?'▦':c==='radial'?'◌':c==='path'?'⌁':c==='random'?'⠿':'—'}<span>{compLabels[c]}</span></button>)}</div><div className="two-col"><Property label="数量" value={group.count} onChange={v=>setCount(Math.max(1,Math.round(v)))}/><Property label="间距" value={group.spacing} onChange={v=>patchGroup({spacing:v})}/><Property label="范围 / 半径" value={group.radius} onChange={v=>patchGroup({radius:v})}/><Property label="排列偏移" value={group.offset} onChange={v=>patchGroup({offset:v})}/></div><label className="toggle-row"><span><b>透视</b><small>透视点为输出画框中心</small></span><input type="checkbox" checked={group.perspective} onChange={e=>patchGroup({perspective:e.target.checked})}/></label>{group.perspective&&<Property label="透视强度" value={group.perspectiveStrength} step={.05} onChange={v=>patchGroup({perspectiveStrength:v})}/>}<label className="toggle-row compact"><span>成员顺序反向</span><input type="checkbox" checked={group.reverse} onChange={e=>patchGroup({reverse:e.target.checked})}/></label></Fold>
    <Fold title="空间路径" badge={group.path?'已绑定':'未绑定'}><button className="outline wide" onClick={addPath}><Route size={15}/>{group.path?'编辑贝塞尔路径':'为元素组建立路径'}</button>{group.path&&<><div className="segmented">{(['line','circle','bezier','free'] as const).map(k=><button className={group.path?.kind===k?'active':''} onClick={()=>patchGroup({path:{...group.path!,kind:k}})} key={k}>{k==='line'?'直线':k==='circle'?'圆':'bezier'===k?'贝塞尔':'自由'}</button>)}</div><div className="two-col"><DropProperty label="偏离距离" value={group.path.offset} bound={findMap(mappings,group.id,'offset')} onDrop={onDrop('path',group.id,'offset',group.path.offset)} setActiveMap={setActiveMap}/><DropProperty label="朝向偏移" value={group.path.angleOffset} bound={findMap(mappings,group.id,'angleOffset')} onDrop={onDrop('path',group.id,'angleOffset',group.path.angleOffset)} setActiveMap={setActiveMap}/></div></>}</Fold>
    <Fold title="成员映射" badge="仅序列"><div className="sequence-drop" onDragOver={e=>e.preventDefault()} onDrop={onDrop('members',group.id,'scaleY',1)}><Waves size={20}/><div><b>成员 Y 缩放</b><small>拖入“完整频谱” · 自动重采样为 {group.count} 项</small></div><Plus size={15}/></div><div className="member-order"><span>稳定顺序</span><b>{compLabels[group.composition]} · {group.reverse?'反向':'正向'}</b></div></Fold></>;
  if(field)return <><PanelTitle icon={<Move size={15}/>} title="移动影响层"/><InspectorHeader title={field.name} type="二维移动向量场" color="#ff8a42"/><Fold title="力场属性" badge="累加"><div className="segmented">{([['directional','固定方向'],['attract','向心吸引'],['repel','中心排斥']] as [FieldKind,string][]).map(([k,l])=><button key={k} className={field.kind===k?'active':''} onClick={()=>patchField({kind:k})}>{l}</button>)}</div><div className="two-col"><DropProperty label="中心 X" value={field.x} bound={findMap(mappings,field.id,'x')} onDrop={onDrop('field',field.id,'x',field.x)} setActiveMap={setActiveMap}/><DropProperty label="中心 Y" value={field.y} bound={findMap(mappings,field.id,'y')} onDrop={onDrop('field',field.id,'y',field.y)} setActiveMap={setActiveMap}/><DropProperty label="范围" value={field.radius} bound={findMap(mappings,field.id,'radius')} onDrop={onDrop('field',field.id,'radius',field.radius)} setActiveMap={setActiveMap}/><DropProperty label="强度" value={field.strength} bound={findMap(mappings,field.id,'strength')} onDrop={onDrop('field',field.id,'strength',field.strength)} setActiveMap={setActiveMap}/><DropProperty label="方向" value={field.direction} bound={findMap(mappings,field.id,'direction')} onDrop={onDrop('field',field.id,'direction',field.direction)} setActiveMap={setActiveMap}/></div><label className="select-label">衰减<select value={field.falloff} onChange={e=>patchField({falloff:e.target.value as Field['falloff']})}><option value="uniform">均匀</option><option value="radial">中心强 · 边缘弱</option></select></label></Fold><div className="calc-order"><Zap size={15}/><div><b>固定计算顺序</b><small>声音映射 → 基础结果 → 路径 → 移动影响累加</small></div></div></>;
  if(selectedShapes.length===1){const s=selectedShapes[0];return <><PanelTitle icon={<Settings2 size={15}/>} title="元素属性"/><InspectorHeader title={s.name} type={s.kind==='circle'?'圆形':s.kind==='rect'?'矩形':'直线'} color={s.fill}/><Fold title="变换" badge="可映射"><div className="two-col"><DropProperty label="X" value={s.x} bound={findMap(mappings,s.id,'x')} onDrop={onDrop('shape',s.id,'x',s.x)} setActiveMap={setActiveMap} onChange={v=>patchShape(s.id,{x:v})}/><DropProperty label="Y" value={s.y} bound={findMap(mappings,s.id,'y')} onDrop={onDrop('shape',s.id,'y',s.y)} setActiveMap={setActiveMap} onChange={v=>patchShape(s.id,{y:v})}/><DropProperty label="宽度" value={s.width} bound={findMap(mappings,s.id,'width')} onDrop={onDrop('shape',s.id,'width',s.width)} setActiveMap={setActiveMap} onChange={v=>patchShape(s.id,{width:v})}/><DropProperty label="高度 / 缩放" value={s.height} bound={findMap(mappings,s.id,'scale')} onDrop={onDrop('shape',s.id,'scale',1)} setActiveMap={setActiveMap} onChange={v=>patchShape(s.id,{height:v})}/><DropProperty label="旋转" value={s.rotation} bound={findMap(mappings,s.id,'rotation')} onDrop={onDrop('shape',s.id,'rotation',s.rotation)} setActiveMap={setActiveMap} onChange={v=>patchShape(s.id,{rotation:v})}/><DropProperty label="透明度" value={s.opacity} bound={findMap(mappings,s.id,'opacity')} onDrop={onDrop('shape',s.id,'opacity',s.opacity)} setActiveMap={setActiveMap} onChange={v=>patchShape(s.id,{opacity:v})}/></div></Fold><Fold title="外观" badge={findMap(mappings,s.id,'color')?'已绑定':'基础'}><label className="color-row"><span>颜色</span><input type="color" value={s.fill} onChange={e=>patchShape(s.id,{fill:e.target.value})}/><code>{s.fill.toUpperCase()}</code></label></Fold><Fold title="空间路径" badge="未绑定"><button className="outline wide"><Route size={15}/> 为元素建立路径</button></Fold></>}
  return <><PanelTitle icon={<Settings2 size={15}/>} title="属性"/><div className="nothing-selected"><SquareDashedMousePointer size={32}/><b>选择画布中的对象</b><span>单击元素查看属性<br/>Shift 单击可多选并成组</span></div><InfoBlock/></>;
}
function findMap(ms:Mapping[],id:string,p:string){return ms.find(m=>m.targetId===id&&m.property===p)}
function InspectorHeader({title,type,color}:{title:string;type:string;color:string}){return <div className="inspector-header"><i style={{background:color}}/><div><b>{title}</b><small>{type}</small></div><button><Eye size={15}/></button></div>}
function Fold({title,badge,children}:{title:string;badge?:string;children:React.ReactNode}){return <section className="fold"><div className="fold-head"><ChevronDown size={14}/><b>{title}</b>{badge&&<span>{badge}</span>}</div><div className="fold-body">{children}</div></section>}
function Property({label,value,onChange,step=1}:{label:string;value:number;onChange?:(n:number)=>void;step?:number}){return <label className="property"><span>{label}</span><input type="number" value={Number(value.toFixed(2))} step={step} onChange={e=>onChange?.(+e.target.value)}/></label>}
function DropProperty({label,value,bound,onDrop,setActiveMap,onChange}:{label:string;value:number;bound?:Mapping;onDrop:(e:React.DragEvent)=>void;setActiveMap:(id:string)=>void;onChange?:(n:number)=>void}){return <label className={`property drop-property ${bound?'bound':''}`} onDragOver={e=>e.preventDefault()} onDrop={onDrop} onClick={()=>bound&&setActiveMap(bound.id)}><span>{label}{bound&&<Link2 size={10}/>}</span><input type="number" value={Number(value.toFixed(2))} readOnly={!!bound} onChange={e=>onChange?.(+e.target.value)}/>{bound&&<i style={{background:sourceMeta[bound.source].color}}/>}</label>}
function InfoBlock(){return <div className="help-card"><Sparkles size={15}/><div><b>编辑提示</b><small>空格拖动平移 · 滚轮缩放<br/>⌘Z 撤销 · Delete 删除</small></div></div>}
function MappingCard({m,active,value,state,patch,remove}:{m:Mapping;active:boolean;value:number;state:AppState;patch:(id:string,p:Partial<Mapping>)=>void;remove:()=>void}){const target=m.targetKind==='members'?'组内成员':state.shapes.find(s=>s.id===m.targetId)?.name||state.groups.find(g=>g.id===m.targetId)?.name||state.fields.find(f=>f.id===m.targetId)?.name||'路径';return <div className={`mapping-card ${active?'active':''} ${!m.enabled?'disabled':''}`} id={`map-${m.id}`}><div className="map-head"><i style={{background:sourceMeta[m.source].color}}/><div><b>{sourceMeta[m.source].label} <span>→</span> {m.property==='scaleY'?'成员 Y 缩放':m.property}</b><small>{target}</small></div><button onClick={()=>patch(m.id,{enabled:!m.enabled})}>{m.enabled?<Eye size={13}/>:<EyeOff size={13}/>}</button></div><div className="map-range"><label>基础值<input type="number" value={m.base} step=".1" onChange={e=>patch(m.id,{base:+e.target.value})}/></label><label>相对最小<input type="number" value={m.min} step=".1" onChange={e=>patch(m.id,{min:+e.target.value})}/></label><label>相对最大<input type="number" value={m.max} step=".1" onChange={e=>patch(m.id,{max:+e.target.value})}/></label></div><div className="map-live"><span>输入 <b>{sourceMeta[m.source].range}</b></span><span>当前输出 <strong>{value.toFixed(2)}</strong></span></div>{m.source==='spectrum'&&<div className="sequence-meta"><span>{state.groups.find(g=>g.id===m.targetId)?.count||0} 成员</span><select value={m.sampling} onChange={e=>patch(m.id,{sampling:e.target.value as Mapping['sampling']})}><option value="average">平均采样</option><option value="peak">峰值采样</option><option value="linear">线性插值</option></select><span>{state.groups.find(g=>g.id===m.targetId)?.count||0} 项</span></div>}<div className="map-actions"><label><input type="checkbox" checked={m.reverse} onChange={e=>patch(m.id,{reverse:e.target.checked})}/> 反向</label><button onClick={remove}><Trash2 size={12}/> 删除</button></div></div>}

export default App;
