'use strict';
(()=>{
  const host=document.getElementById('irisRoot');
  if(!host)return;

  let proto=host,desc=null;
  while((proto=Object.getPrototypeOf(proto))&&!desc){
    desc=Object.getOwnPropertyDescriptor(proto,'innerHTML');
  }
  if(!desc?.get||!desc?.set)return;

  const get=desc.get,set=desc.set;
  const text=el=>(el?.textContent||'').replace(/\s+/g,' ').trim();
  const seriesSignature=root=>{
    const items=[...root.querySelectorAll?.('details[data-iris-detail]')||[]].map(d=>{
      const card=d.closest('.iris-series');
      return `${d.dataset.irisDetail||''}|${text(card)}`;
    });
    items.sort();
    return items.join('||');
  };
  const signature=root=>{
    if(!root?.querySelector)return '';
    const top=root.querySelector('.iris-topnav button.selected')?.dataset?.irisView||'';
    const sub=root.querySelector('.iris-subnav button.selected')?.dataset?.irisView||'';
    const next=text(root.querySelector('.iris-dashboard .iris-dash-card:first-child>b'));
    const permission=root.querySelector('.iris-dash-card.permission');
    const gate=`${permission?.className||''}|${text(permission?.querySelector('b'))}|${text(permission?.querySelector('span'))}`;
    const counts=text(root.querySelector('.iris-dash-card.series'));
    const series=seriesSignature(root);
    const fallback=series?'':text(root.querySelector('.iris-content'));
    return [top,sub,next,gate,counts,series,fallback].join('###');
  };
  const parse=html=>{
    const t=document.createElement('template');
    t.innerHTML=String(html??'');
    return t.content;
  };
  const copyStatus=fragment=>{
    const incoming=fragment.querySelector?.('.iris-save');
    const current=host.querySelector('.iris-save');
    if(incoming&&current)current.textContent=incoming.textContent;
  };

  Object.defineProperty(host,'innerHTML',{
    configurable:true,
    enumerable:desc.enumerable,
    get(){return get.call(this)},
    set(html){
      const value=String(html??'');
      if(this.querySelector?.('.iris-app')){
        const incoming=parse(value);
        // Never tear down all current cards just to display the short-lived
        // background "ОБНОВЛЕНИЕ…" state.
        if(incoming.querySelector('#iris-generate')?.textContent?.includes('ОБНОВЛЕНИЕ')){
          copyStatus(incoming);
          return;
        }
        // Background polling often produces byte-new state objects with the
        // exact same visible IRIS facts. Keep the existing DOM in that case.
        if(signature(this)===signature(incoming)){
          copyStatus(incoming);
          return;
        }
      }
      set.call(this,value);
    }
  });
})();
