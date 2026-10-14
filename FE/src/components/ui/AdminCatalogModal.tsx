import {ReactNode,useEffect,useRef} from 'react';
/** Modal dùng chung cho quản trị catalog: Escape, focus trap và phục hồi focus. */
export default function AdminCatalogModal({title,busy,onClose,children}:{title:string;busy:boolean;onClose:()=>void;children:ReactNode}){
  const ref=useRef<HTMLDivElement>(null);const latest=useRef({busy,onClose});latest.current={busy,onClose};
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const controls=()=>Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')||[]);
    controls()[0]?.focus();const key=(e:KeyboardEvent)=>{
      if(e.key==='Escape'&&!latest.current.busy)latest.current.onClose();
      if(e.key==='Tab'){const list=controls(),first=list[0],last=list[list.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
    };document.addEventListener('keydown',key);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);previous?.focus();};
  },[]);
  return <div className="catalog-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <div ref={ref} className="catalog-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-modal-title">
      <header><h2 id="catalog-modal-title">{title}</h2><button type="button" aria-label="Đóng" disabled={busy} onClick={onClose}>×</button></header>{children}
    </div>
  </div>;
}
