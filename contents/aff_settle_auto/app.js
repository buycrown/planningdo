/* ============================================================
 * 어필리에이트 마케팅 정산 자동화 기획 — 화면 구성 로직
 *  - 좌→우 파이프라인 보드 렌더링 + SVG 연결선
 *  - 항목 추가/삭제(제외/포함), 버전 저장/불러오기, 기본안 원복
 *  - 프로토타입 화면보기 팝업
 * ============================================================ */
(function () {
  'use strict';

  const LS_KEY = 'afAutoPlan.versions.v2';
  const FEAS_LABEL = { yes: '자동화 가능', part: '부분 가능', no: '자동화 불가', exist: '기존 프로세스 활용' };
  const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];

  /* ---------- 상태 ---------- */
  const state = {
    excluded: new Set(),          // 제외된 항목 id
    customs: [],                  // {id, stepId, col:'autos'|'scopes', title, desc, feas?, size?}
    customSeq: 1
  };
  let memoryVersions = [];        // localStorage 불가 환경 폴백

  /* ---------- 유틸 ---------- */
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function loadVersions() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch (e) { return memoryVersions; }
  }
  function saveVersions(list) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(list)); }
    catch (e) { memoryVersions = list; }
  }

  function allItems() {
    const out = [];
    BOARD_DATA.steps.forEach(st => {
      ['manuals', 'autos', 'scopes'].forEach(col => (st[col] || []).forEach(it => out.push({ ...it, stepId: st.id, col, color: st.color })));
    });
    state.customs.forEach(c => out.push({ ...c, custom: true }));
    return out;
  }
  const isActive = it => !state.excluded.has(it.id);

  /* ============================================================
   * 렌더링
   * ============================================================ */
  function highlight(text) {
    // [AI], 숫자·핵심 키워드 하이라이트
    return esc(text)
      .replace(/(사업자 유무|세금계산서 발행 주체|원천세 거래선|기타거래처|원천세 3\.3%|익월 10일|익월 20일|7219119|E502\/F871|E502|F871|30059|차변 합계 = 대변|PK50 대변 = PK40 차변 합계|LG CNS|ICT운영BSU|회계BSU|거래선코드|기안번호|최다 오류 지점)/g, '<mark>$1</mark>');
  }

  /* 작업 규모: 유형별 개발 대상 개수 (화면 n · 기능 n · 연동 n) */
  function scaleOf(scope) {
    const c = { 화면: 0, 기능: 0, 연동: 0 };
    (scope.groups || []).forEach(g => {
      const t = SCOPE_TYPES[g.type];
      if (t) c[t.unit] += g.items.length;
    });
    return c;
  }
  const scaleText = c => ['화면', '기능', '연동'].filter(u => c[u]).map(u => `${u} ${c[u]}`).join(' · ') || '—';

  function manualCard(it, color) {
    const steps = (it.steps || []).map((s, i) =>
      `<li><b class="m-no">${CIRCLED[i] || (i + 1)}</b>${highlight(s)}</li>`).join('');
    return `<div class="card manual" id="card-${it.id}" style="--c:${color}">
      <div class="card-top">
        <span class="cid">${esc(it.id.toUpperCase())}</span>
        ${it.outcome ? `<span class="outcome">산출물: ${esc(it.outcome)}</span>` : ''}
      </div>
      <h4>${highlight(it.title)}</h4>
      ${it.desc ? `<p>${highlight(it.desc)}</p>` : ''}
      ${steps ? `<ul class="m-steps">${steps}</ul>` : ''}
    </div>`;
  }

  function autoCard(it, color) {
    const off = !isActive(it);
    const feas = it.feas || 'yes';
    return `<div class="card auto feas-${feas} ${off ? 'off' : ''} ${it.custom ? 'custom' : ''}" id="card-${it.id}" style="--c:${color}">
      <div class="card-top">
        <span class="feas feas-${feas}">${FEAS_LABEL[feas]}</span>
        ${it.custom ? '<span class="badge-custom">회의 중 추가</span>' : ''}
        <span class="spacer"></span>
        ${feas === 'no' && !it.custom ? '' : toggleBtn(it)}
      </div>
      <h4>${highlight(it.title)}</h4>
      <p>${highlight(it.desc)}</p>
    </div>`;
  }

  function scopeCard(it, color) {
    const off = !isActive(it);
    // 작업 대상 유형(WEB PAGE / ADMIN PAGE / ADMIN FUNCTION / INTERFACE)별 그룹
    const groups = (it.groups || []).map(g => {
      const t = SCOPE_TYPES[g.type] || { label: g.sys || '기타', icon: '📝', color: '#94a3b8', unit: '건' };
      return `<div class="sg" style="--tc:${t.color}">
         <div class="sg-head"><span class="sg-ico">${t.icon}</span>${esc(t.label)}<span class="sg-cnt">${t.unit} ${g.items.length}</span></div>
         <ul class="scope-items">${g.items.map(x => `<li>${highlight(x)}</li>`).join('')}</ul>
       </div>`;
    }).join('');
    const fallback = it.desc && !groups ? `<p>${highlight(it.desc)}</p>` : '';
    const protoBtns = [it.proto, it.proto2].filter(Boolean).map((p, i) =>
      `<button class="btn-proto" data-proto="${p}">🖥 화면보기${it.proto2 ? ' ' + (i + 1) : ''}</button>`).join('');
    return `<div class="card scope ${off ? 'off' : ''} ${it.custom ? 'custom' : ''}" id="card-${it.id}" style="--c:${color}">
      <div class="card-top">
        <span class="scale">${scaleText(scaleOf(it))}</span>
        ${it.alt ? `<span class="badge-alt" title="${esc(it.altNote || '')}">${esc(it.alt)} · 택일</span>` : ''}
        ${it.custom ? '<span class="badge-custom">회의 중 추가</span>' : ''}
        <span class="spacer"></span>
        ${toggleBtn(it)}
      </div>
      <h4>${highlight(it.title)}</h4>
      ${groups || fallback}
      ${it.depends ? `<p class="depends">⛓ ${highlight(it.depends)}</p>` : ''}
      ${protoBtns ? `<div class="card-actions">${protoBtns}</div>` : ''}
    </div>`;
  }

  function toggleBtn(it) {
    if (it.custom) return `<button class="btn-x del" data-del="${it.id}" title="항목 삭제">삭제 ✕</button>`;
    return isActive(it)
      ? `<button class="btn-x" data-toggle="${it.id}" title="자동화 대상에서 제외">제외 −</button>`
      : `<button class="btn-x add" data-toggle="${it.id}" title="자동화 대상에 포함">포함 +</button>`;
  }

  function addForm(stepId, col) {
    const extra = col === 'autos'
      ? `<select class="af-feas"><option value="yes">자동화 가능</option><option value="part">부분 가능</option><option value="no">자동화 불가</option><option value="exist">기존 프로세스 활용</option></select>`
      : `<select class="af-type"><option value="web">WEB PAGE</option><option value="adminPage" selected>ADMIN PAGE</option><option value="adminFn">ADMIN FUNCTION</option><option value="if">INTERFACE</option></select>`;
    return `<div class="add-slot" data-step="${stepId}" data-col="${col}">
      <button class="btn-addslot">＋ 항목 추가</button>
      <div class="add-form hidden">
        <input class="af-title" placeholder="항목 제목" maxlength="80">
        <textarea class="af-desc" placeholder="내용 (선택)" rows="2"></textarea>
        <div class="af-row">${extra}<span class="spacer"></span><button class="af-cancel">취소</button><button class="af-ok">추가</button></div>
      </div>
    </div>`;
  }

  function render() {
    const board = $('#lanes');
    board.innerHTML = BOARD_DATA.steps.map(st => {
      const customsA = state.customs.filter(c => c.stepId === st.id && c.col === 'autos');
      const customsW = state.customs.filter(c => c.stepId === st.id && c.col === 'scopes');
      return `<section class="lane ${st.ai ? 'lane-ai' : ''}" style="--c:${st.color}" id="lane-${st.id}">
        <div class="lane-label"><span class="lane-no">${esc(st.no)}</span><h3>${esc(st.title)}</h3><span class="lane-freq">${esc(st.freq)}</span></div>
        <div class="lane-cols">
          <div class="cell">${st.manuals.map(m => manualCard(m, st.color)).join('')}</div>
          <div class="cell">${st.autos.map(a => autoCard(a, st.color)).join('')}${customsA.map(a => autoCard(a, st.color)).join('')}${addForm(st.id, 'autos')}</div>
          <div class="cell">${st.scopes.map(w => scopeCard(w, st.color)).join('')}${customsW.map(w => scopeCard(w, st.color)).join('')}${addForm(st.id, 'scopes')}</div>
        </div>
      </section>`;
    }).join('');

    renderSummary();
    renderRoadmap();
    updateSummary();
    requestAnimationFrame(drawWires);
  }

  /* ============================================================
   * APPENDIX — 단계별 자동화 로드맵 (마일스톤)
   * ============================================================ */
  function renderRoadmap() {
    const r = BOARD_DATA.roadmap;
    if (!r) return;
    $('#roadmap').innerHTML = `
      <div class="rm-head">
        <span class="rm-tag">APPENDIX</span>
        <h3>자동화 로드맵 — 단계별 마일스톤</h3>
        <span class="rm-note">${esc(r.intro)}</span>
      </div>
      <div class="ph-track">
        ${r.phases.map((p, i) => `
        <div class="ph-col">
          <div class="ph-node" style="--pc:${p.color}">
            <span class="ph-no">${esc(p.no)}</span>
            ${i < r.phases.length - 1 ? '<span class="ph-arrow">→</span>' : ''}
          </div>
          <div class="ph-card" style="--pc:${p.color}">
            <h4>${esc(p.name)}</h4>
            <p class="ph-trigger">🚩 ${esc(p.trigger)}</p>
            ${p.works.length ? `<div class="ph-sec"><b>착수 작업</b><ul>
              ${p.works.map(w => `<li><code>${esc(w.ref)}</code><i class="ph-scale">${esc(w.scale)}</i> ${highlight(w.text)}</li>`).join('')}
            </ul></div>` : ''}
            <div class="ph-sec manual"><b>수기 유지</b><ul>
              ${p.manual.map(m => `<li>${highlight(m)}</li>`).join('')}
            </ul></div>
            <p class="ph-why">${highlight(p.why)}</p>
          </div>
        </div>`).join('')}
      </div>`;
  }

  /* ============================================================
   * SUMMARY 장표 — 작업 대상별 작업 내용 집계 (제외/추가 실시간 반영)
   * ============================================================ */
  const SUMMARY_BUCKETS = [
    { key: 'web',       purpose: '크리에이터에게 노출되는 프론트 화면 — 안내 · 신청 · 서류 제출을 셀프 서비스로 전환해 메신저/이메일 수기 취합 제거' },
    { key: 'adminPage', purpose: 'NBOS 관리 화면(UI) — 실무자가 조회 · 승인 · 관리하는 화면. 컨텐츠본부 실무자가 직접 사용하는 운영 도구' },
    { key: 'adminFn',   purpose: '화면 뒤 처리 기능 · 로직 — 상태값 관리, 검증 룰, 암호화, 자료 생성 · 발송. 화면 개발과 별도로 정의 · 검수가 필요한 영역' },
    { key: 'if',        purpose: '시스템 간 연동 — NBOS↔SAP 전송, 전표 BATCH. 외부 조직(ICT운영BSU · LG CNS) 협업이 필요해 리드타임이 가장 긴 영역' },
    { key: 'etc',       purpose: '미팅에서 신규 제안된 작업 항목' }
  ];

  function renderSummary() {
    const buckets = { web: [], adminPage: [], adminFn: [], if: [], etc: [] };
    BOARD_DATA.steps.forEach(st => {
      (st.scopes || []).forEach(w => {
        if (!isActive(w)) return;
        (w.groups || []).forEach(g => {
          const key = buckets[g.type] ? g.type : 'etc';
          g.items.forEach(item => buckets[key].push({ item, ref: w.id.toUpperCase(), color: st.color }));
        });
      });
    });
    state.customs.filter(c => c.col === 'scopes' && isActive(c)).forEach(c => {
      const st = BOARD_DATA.steps.find(s => s.id === c.stepId);
      const key = buckets[c.type] ? c.type : 'etc';
      buckets[key].push({ item: c.title + (c.desc ? ' — ' + c.desc : ''), ref: c.id.toUpperCase(), color: st ? st.color : '#a5b4fc' });
    });

    const rows = SUMMARY_BUCKETS.filter(b => buckets[b.key].length).map(b => {
      const t = SCOPE_TYPES[b.key] || { label: '회의 중 추가', icon: '📝', color: '#94a3b8', unit: '건' };
      const list = buckets[b.key];
      const refs = Array.from(new Set(list.map(x => x.ref)));
      return `<div class="sumb-row" style="--bc:${t.color}">
        <div class="sumb-target">
          <span class="sumb-ico">${t.icon}</span>
          <div><b style="color:${t.color}">${esc(t.label)}</b>
          <div class="sumb-refs">${refs.map(r => `<i style="background:${(list.find(x => x.ref === r) || {}).color || '#94a3b8'}">${esc(r)}</i>`).join('')}</div></div>
          <span class="sumb-cnt" style="color:${t.color};border-color:${t.color}33;background:${t.color}0d">${t.unit} ${list.length}</span>
        </div>
        <div class="sumb-purpose">${esc(b.purpose)}</div>
        <div class="sumb-works"><ul>${list.map(x => `<li><em style="background:${x.color}"></em>${highlight(x.item)}</li>`).join('')}</ul></div>
      </div>`;
    }).join('');

    $('#summaryBoard').innerHTML = `
      <div class="sumb-head">
        <span class="sumb-tag">SUMMARY</span>
        <h3>작업 대상별 작업 내용</h3>
        <span class="sumb-live">● 보드에서 제외/추가한 항목이 실시간 반영됩니다</span>
      </div>
      <div class="sumb-cols"><span>작업 대상</span><span>목적</span><span>작업 내용</span></div>
      ${rows}`;
  }

  /* ---------- 요약 바 ---------- */
  function updateSummary() {
    const items = allItems();
    const autos = items.filter(i => i.col === 'autos' && i.feas !== 'no');
    const scopes = items.filter(i => i.col === 'scopes');
    const actA = autos.filter(isActive), actW = scopes.filter(isActive);
    const total = { 화면: 0, 기능: 0, 연동: 0 };
    actW.forEach(w => { const c = scaleOf(w); total.화면 += c.화면; total.기능 += c.기능; total.연동 += c.연동; });
    $('#summary').innerHTML =
      `<span class="sum-item">자동화 과제 <b>${actA.length}</b><i>/${autos.length}</i></span>
       <span class="sum-item">작업 범위 <b>${actW.length}</b><i>/${scopes.length}</i></span>
       <span class="sum-item">개발 대상 <b class="sz">화면 ${total.화면} · 기능 ${total.기능} · 연동 ${total.연동}</b></span>`;
  }

  /* ============================================================
   * SVG 연결선
   * ============================================================ */
  function drawWires() {
    const svg = $('#wires'), board = $('#board');
    if (!svg || !board) return;
    svg.setAttribute('width', board.scrollWidth);
    svg.setAttribute('height', board.scrollHeight);
    svg.innerHTML = '';
    const br = board.getBoundingClientRect();
    const pt = el => {
      const r = el.getBoundingClientRect();
      return { l: r.left - br.left, r: r.right - br.left, t: r.top - br.top, m: r.top - br.top + r.height / 2 };
    };
    const items = allItems();
    const paths = [];
    items.forEach(it => {
      if (!it.links) return;
      const toEl = document.getElementById('card-' + it.id);
      if (!toEl) return;
      it.links.forEach(srcId => {
        const fromEl = document.getElementById('card-' + srcId);
        if (!fromEl) return;
        const a = pt(fromEl), b = pt(toEl);
        const x1 = a.r, y1 = a.m, x2 = b.l, y2 = b.m;
        const dx = Math.max(36, (x2 - x1) / 2);
        const srcItem = items.find(x => x.id === srcId);
        const dim = !isActive(it) || (srcItem && srcItem.col !== 'manuals' && !isActive(srcItem));
        paths.push({ d: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, c: it.color || '#94a3b8', dim });
      });
    });
    svg.innerHTML = paths.map(p =>
      `<path d="${p.d}" fill="none" stroke="${p.dim ? '#cbd5e1' : p.c}" stroke-width="${p.dim ? 1.5 : 2.5}" ${p.dim ? 'stroke-dasharray="5 5"' : ''} opacity="${p.dim ? 0.55 : 0.5}"/>
       <circle cx="${p.d.split(' ').pop().split(',')[0].replace('C', '')}" r="0" />`).join('')
      + paths.map(p => {
        const m = p.d.match(/M([\d.]+),([\d.]+)/); const e = p.d.match(/ ([\d.]+),([\d.]+)$/);
        return `<circle cx="${m[1]}" cy="${m[2]}" r="3.5" fill="${p.dim ? '#cbd5e1' : p.c}"/><circle cx="${e[1]}" cy="${e[2]}" r="3.5" fill="${p.dim ? '#cbd5e1' : p.c}"/>`;
      }).join('');
  }

  /* ============================================================
   * 버전 저장 / 불러오기 / 원복
   * ============================================================ */
  function snapshot() {
    return { excluded: Array.from(state.excluded), customs: state.customs.slice(), seq: state.customSeq };
  }
  function applySnapshot(s) {
    state.excluded = new Set(s.excluded || []);
    state.customs = (s.customs || []).slice();
    state.customSeq = s.seq || state.customs.length + 1;
    render();
  }
  function refreshVersionSelect() {
    const list = loadVersions();
    const sel = $('#verSelect');
    sel.innerHTML = '<option value="">저장된 버전 불러오기…</option>' +
      list.map((v, i) => `<option value="${i}">${esc(v.name)} (${esc(v.ts)})</option>`).join('');
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._tm); toast._tm = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ============================================================
   * 프로토타입 모달
   * ============================================================ */
  function openProto(key) {
    const p = PROTOS[key];
    if (!p) return;
    $('#modalTitle').textContent = p.title;
    $('#modalBody').innerHTML = p.html;
    $('#modal').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeProto() {
    $('#modal').classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ============================================================
   * 좌측 STEP 앵커 내비게이션 (스크롤 스파이 포함)
   * ============================================================ */
  const NAV_SHORT = { s1: '계약·날인', s2: '거래선', s3: '정산 기안', s4: '전표 입력', s5: '손익배부', s6: '추가 과제' };

  function buildNav() {
    const items = BOARD_DATA.steps.map(st => ({
      target: 'lane-' + st.id, no: st.no.replace('STEP ', ''), label: NAV_SHORT[st.id] || st.title, color: st.color
    }));
    items.push({ sep: true });
    items.push({ target: 'summaryBoard', no: 'S', label: 'SUMMARY', color: '#0d9488', toLeft: true });
    items.push({ target: 'roadmap', no: 'A', label: '로드맵', color: '#0f172a', toLeft: true });
    $('#stepNav').innerHTML = '<div class="nav-cap">STEP 이동</div>' + items.map(it =>
      it.sep ? '<div class="nav-sep"></div>' :
      `<button class="nav-item" data-nav="${it.target}" ${it.toLeft ? 'data-toleft="1"' : ''} style="--nc:${it.color}">
         <span class="nav-dot">${esc(it.no)}</span><span class="nav-lbl">${esc(it.label)}</span>
       </button>`).join('');
  }

  function navSpy() {
    const ids = BOARD_DATA.steps.map(st => 'lane-' + st.id).concat(['summaryBoard', 'roadmap']);
    let current = ids[0];
    const probe = window.innerHeight * 0.38;
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top <= probe) current = id;
    });
    $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.nav === current));
  }

  /* ============================================================
   * 이벤트
   * ============================================================ */
  document.addEventListener('click', e => {
    const t = e.target;

    const navBtn = t.closest && t.closest('.nav-item');
    if (navBtn) {
      const el = document.getElementById(navBtn.dataset.nav);
      if (el) {
        const top = el.getBoundingClientRect().top + window.scrollY - 155;
        const opts = { top: Math.max(0, top), behavior: 'smooth' };
        if (navBtn.dataset.toleft) opts.left = 0;   // SUMMARY/APPENDIX는 좌측 정렬 섹션이므로 가로도 원점으로
        window.scrollTo(opts);
      }
      return;
    }

    if (t.dataset.toggle) {
      const id = t.dataset.toggle;
      state.excluded.has(id) ? state.excluded.delete(id) : state.excluded.add(id);
      render();
      toast(state.excluded.has(id) ? '자동화 대상에서 제외했습니다' : '자동화 대상에 포함했습니다');
      return;
    }
    if (t.dataset.del) {
      state.customs = state.customs.filter(c => c.id !== t.dataset.del);
      render(); toast('항목을 삭제했습니다');
      return;
    }
    if (t.dataset.proto) { openProto(t.dataset.proto); return; }
    if (t.id === 'modalClose' || t.id === 'modal') { closeProto(); return; }

    if (t.classList.contains('btn-addslot')) {
      $$('.add-form').forEach(f => f.classList.add('hidden'));
      $('.add-form', t.parentElement).classList.remove('hidden');
      $('.af-title', t.parentElement).focus();
      return;
    }
    if (t.classList.contains('af-cancel')) { t.closest('.add-form').classList.add('hidden'); return; }
    if (t.classList.contains('af-ok')) {
      const slot = t.closest('.add-slot'), form = t.closest('.add-form');
      const title = $('.af-title', form).value.trim();
      if (!title) { $('.af-title', form).focus(); return; }
      const col = slot.dataset.col;
      const item = {
        id: 'c' + (state.customSeq++), stepId: slot.dataset.step, col,
        title, desc: $('.af-desc', form).value.trim(), custom: true
      };
      if (col === 'autos') item.feas = $('.af-feas', form).value;
      else {
        item.type = $('.af-type', form).value;
        item.groups = [{ type: item.type, items: [item.desc || item.title] }];
      }
      state.customs.push(item);
      render(); toast('항목을 추가했습니다');
      return;
    }

    if (t.id === 'btnSave') {
      const name = $('#verName').value.trim() || '회의안 ' + (loadVersions().length + 1);
      const list = loadVersions();
      list.unshift({ name, ts: new Date().toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }), snap: snapshot() });
      saveVersions(list.slice(0, 20));
      $('#verName').value = '';
      refreshVersionSelect();
      toast(`버전 "${name}" 저장 완료`);
      return;
    }
    if (t.id === 'btnReset') {
      if (!confirm('추가/제외한 내용을 모두 버리고 기본안으로 원복할까요?\n(저장된 버전은 유지됩니다)')) return;
      applySnapshot({ excluded: [], customs: [] });
      toast('기본안으로 원복했습니다');
      return;
    }
    if (t.id === 'btnDelVer') {
      const sel = $('#verSelect');
      if (sel.value === '') { toast('삭제할 버전을 먼저 선택하세요'); return; }
      const list = loadVersions();
      const v = list.splice(Number(sel.value), 1)[0];
      saveVersions(list); refreshVersionSelect();
      toast(`버전 "${v.name}" 삭제`);
      return;
    }
  });

  document.addEventListener('change', e => {
    if (e.target.id === 'verSelect' && e.target.value !== '') {
      const v = loadVersions()[Number(e.target.value)];
      if (v) { applySnapshot(v.snap); toast(`버전 "${v.name}" 불러옴`); }
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProto(); });

  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(drawWires, 150); });
  let sp;
  window.addEventListener('scroll', () => { clearTimeout(sp); sp = setTimeout(navSpy, 80); }, { passive: true });

  /* ---------- 초기화 ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    $('#docTitle').textContent = BOARD_DATA.meta.title;
    $('#docSub').textContent = BOARD_DATA.meta.subtitle + ' · ' + BOARD_DATA.meta.version;
    $('#docAccount').textContent = BOARD_DATA.meta.account;
    refreshVersionSelect();
    buildNav();
    render();
    navSpy();
    // 폰트 로딩 후 연결선 재계산
    setTimeout(drawWires, 400);
    setTimeout(drawWires, 1200);
  });
})();
