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
  const RESTORED_RULES=`<ol class="iris-rules"><li>Берём <b>5 последних последовательных тиражей</b> и строим для каждого числа ритм 0/1.</li><li>Приоритетные ритмы-якоря: <b>1010, 01010, 11010, 10101, 10100, 01111</b>. Ритм нужен для запуска структуры, но <b>не обязан быть у каждого числа</b> комбинации.</li><li>После якоря IRIS расширяет структуру по полю 1–80: <b>вертикали одного столбца +10…+70</b> и связи в одном ряду <b>±2</b>. Диагональ не является обязательным каркасом.</li><li>Одна комбинация может состоять из <b>нескольких структурных фрагментов</b>. Она не обязана быть одной сплошной связной фигурой.</li><li>Основная IRIS формирует самостоятельные комбинации <b>5–10 чисел</b>. Жёстких ограничений «не больше 2 в ряду» и «не больше 8 повторов 3+» больше нет.</li><li>Разрешение A / PLAY есть, когда в окне найден хотя бы один сильный ритм-якорь и из него с геометрическим продолжением собрана комбинация 5–10 чисел.</li><li>MINI‑3 и MINI‑4 ищутся отдельно от основной IRIS, но используют тот же принцип: ритм-якорь → структурное продолжение.</li><li>После фиксации числа не пересчитываются. По решению проекта каждая серия, как и раньше, проверяется на <b>следующих 5 тиражах</b>, даже если исторический билет когда-то играл меньше.</li></ol>`;
  const rewrite=html=>String(html??'')
    .replace('Расчёт использует последние 4 тиража для основного ритма и пятый — для поддержки. Каждая найденная фигура запускается отдельной серией на 5 тиражей.','Расчёт использует окно из 5 последовательных тиражей. Сильные ритмы дают якоря, затем IRIS расширяет их по вертикалям и ±2; одна комбинация может включать несколько структурных фрагментов. Каждая серия по-прежнему проверяется 5 тиражей.')
    .replace('Проверяем разрешение A.','Ищем ритм-якоря в окне 5 тиражей.')
    .replace('Ищем несколько независимых комбинаций.','Расширяем якоря по вертикалям и ±2 и собираем самостоятельные комбинации.')
    .replace(/<ol class="iris-rules">[\s\S]*?<\/ol>/,RESTORED_RULES);

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
      const value=rewrite(html);
      if(this.querySelector?.('.iris-app')){
        const incoming=parse(value);
        if(incoming.querySelector('#iris-generate')?.textContent?.includes('ОБНОВЛЕНИЕ')){
          copyStatus(incoming);
          return;
        }
        if(signature(this)===signature(incoming)){
          copyStatus(incoming);
          return;
        }
      }
      set.call(this,value);
    }
  });
})();
