'use strict';
(()=>{
  const host=document.getElementById('irisRoot');
  if(!host)return;

  // IRIS works automatically. The manual button remains only as an immediate refresh.
  try{localStorage.setItem('iris-v63-auto','true')}catch{}

  let proto=host,desc=null;
  while((proto=Object.getPrototypeOf(proto))&&!desc){
    desc=Object.getOwnPropertyDescriptor(proto,'innerHTML');
  }
  if(!desc?.get||!desc?.set)return;

  const get=desc.get,set=desc.set;
  const text=el=>(el?.textContent||'').replace(/\s+/g,' ').trim();
  const RESTORED_RULES=`<ol class="iris-rules"><li>Берём <b>5 последних последовательных тиражей</b> и строим для каждого числа ритм 0/1.</li><li>Приоритетные ритмы-якоря: <b>1010, 01010, 11010, 10101, 10100, 01111</b>. Ритм запускает структуру, но <b>не обязан быть у каждого числа</b> комбинации.</li><li>После якоря IRIS расширяет структуру по полю 1–80: <b>вертикали одного столбца +10…+70</b> и связи в одном ряду <b>±2</b>. Диагональ не является обязательным каркасом.</li><li>Одна комбинация может состоять из <b>нескольких структурных фрагментов</b>. Она не обязана быть одной сплошной связной фигурой.</li><li>Основная IRIS формирует самостоятельные комбинации <b>5–10 чисел</b>. Ограничения «не больше 2 в ряду» и «не больше 8 повторов 3+» <b>не используются</b>.</li><li>Разрешение A / PLAY есть, когда в окне найден хотя бы один сильный ритм-якорь и из него с геометрическим продолжением собрана комбинация 5–10 чисел.</li><li>MINI‑3 и MINI‑4 ищутся отдельно от основной IRIS по тому же принципу: ритм-якорь → структурное продолжение.</li><li>После фиксации числа не пересчитываются. Каждая серия проверяется на <b>следующих 5 тиражах</b> и затем уходит в архив.</li></ol>`;

  const rewrite=html=>String(html??'')
    .replace('Расчёт использует последние 4 тиража для основного ритма и пятый — для поддержки. Каждая найденная фигура запускается отдельной серией на 5 тиражей.','Расчёт использует окно из 5 последовательных тиражей. Сильные ритмы дают якоря, затем IRIS расширяет их по вертикалям +10…+70 и ±2. Одна комбинация может включать несколько структурных фрагментов. Каждая серия проверяется 5 тиражей.')
    .replace('Проверяем разрешение A.','Ищем ритм-якоря в окне 5 тиражей.')
    .replace('Ищем несколько независимых комбинаций.','Расширяем якоря по вертикалям и ±2 и собираем самостоятельные комбинации.')
    .replace('При разрешении A нажмите «Рассчитать новые комбинации». Старые серии при этом не стираются.','При разрешении A новые комбинации фиксируются автоматически. Кнопка расчёта нужна только для немедленного ручного обновления. Старые серии не стираются.')
    .replace('РАССЧИТАТЬ НОВЫЕ КОМБИНАЦИИ','ОБНОВИТЬ / ПЕРЕСЧИТАТЬ СЕЙЧАС')
    .replace('Проверить разрешение и найти серии','Автоматический расчёт включён · ручное обновление')
    .replace(/<p>Максимум чисел в одном ряду:[\s\S]*?<\/p>/,'<p><b>Структура:</b> жёсткого лимита чисел в одном ряду больше нет.</p>')
    .replace(/<p>Чисел с повтором 3\+ в пяти исходных тиражах: <b>([^<]*)<\/b>[\s\S]*?<\/p>/,'<p>Чисел с повтором 3+ в окне: <b>$1</b> · это справочная величина, <b>не запрет A</b>.</p>')
    .replace(/<p>Для B у отдельной фигуры нужно ≥7 занятых рядов и ≥3 вертикальных связей\.<\/p>/,'<p>PLAY+ / B в восстановленной IRIS не используется как обязательный фильтр.</p>')
    .replace(/<label class="iris-switch"><input id="iris-auto" type="checkbox"[^>]*> Автоматически фиксировать новые серии при разрешении A<\/label>/,'<label class="iris-switch"><input id="iris-auto" type="checkbox" checked disabled> Автоматически фиксировать новые серии при разрешении A</label>')
    .replace('Серверная проверка идёт отдельно и продолжает закрывать серии, когда телефон выключен. Эта настройка управляет только локальным автозапуском.','Автоматический режим включён постоянно. После свежего факта IRIS сама пересчитывает окно; при разрешении A новые серии фиксируются автоматически. Сервер продолжает записывать и закрывать серии, даже когда телефон выключен.')
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
    const gate=`${permission?.className||''}|${text(permission?.querySelector('b'))}|${text(permission?.querySelector('span'))}|${text(permission?.querySelector('em'))}`;
    const counts=text(root.querySelector('.iris-dash-card.series'));
    const action=text(root.querySelector('#iris-generate'));
    const series=seriesSignature(root);
    const fallback=series?'':text(root.querySelector('.iris-content'));
    return [top,sub,next,gate,counts,action,series,fallback].join('###');
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
    const incomingGate=fragment.querySelector?.('.iris-dash-card.permission em');
    const currentGate=host.querySelector('.iris-dash-card.permission em');
    if(incomingGate&&currentGate)currentGate.textContent=incomingGate.textContent;
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
