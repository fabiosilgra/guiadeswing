/* Guia de Swing — comportamento do site (aviso +18, menu, busca, "Funciona hoje", minha lista). */
(function () {
  'use strict';

  var DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var DIAS_LONGOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var ICONE_RELOGIO =
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';

  function fmt(min) {
    var h = ('0' + Math.floor(min / 60)).slice(-2);
    var m = min % 60;
    return m ? h + 'h' + ('0' + m).slice(-2) : h + 'h';
  }

  /* Dia da semana e minutos desde a meia-noite, sempre no horário de São Paulo. */
  function agoraSP(date) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(date || new Date());
    var get = function (t) { for (var i = 0; i < parts.length; i++) if (parts[i].type === t) return parts[i].value; return '0'; };
    var map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    var h = parseInt(get('hour'), 10);
    if (h === 24) h = 0;
    return { dia: map[get('weekday')], min: h * 60 + parseInt(get('minute'), 10) };
  }

  /* "5@22:00-05:00 6@22:00-" -> [{d:5, a:1320, b:300}, {d:6, a:1320, b:null}] */
  function parseHorarios(str) {
    if (!str) return [];
    return str.split(' ').filter(Boolean).map(function (t) {
      var p = t.split('@');
      var hs = p[1].split('-');
      var hm = function (x) { var q = x.split(':'); return (+q[0]) * 60 + (+q[1]); };
      return { d: +p[0], a: hm(hs[0]), b: hs[1] ? hm(hs[1]) : null };
    });
  }

  /* Está aberto agora? Considera casas que fecham de madrugada (ex.: 22h às 05h). */
  function abertoAgora(hs, agora) {
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      if (h.b == null) continue;
      var cruza = h.b <= h.a;
      if (h.d === agora.dia && agora.min >= h.a && (cruza || agora.min < h.b)) return { ate: h.b };
      if (cruza && h.d === (agora.dia + 6) % 7 && agora.min < h.b) return { ate: h.b };
    }
    return null;
  }

  /* Próxima abertura. off = 0 (hoje), 1 (amanhã)... */
  function proxima(hs, agora) {
    for (var off = 0; off <= 7; off++) {
      var d = (agora.dia + off) % 7;
      var lista = hs
        .filter(function (h) { return h.d === d && (off > 0 || h.a >= agora.min); })
        .sort(function (a, b) { return a.a - b.a; });
      if (lista.length) return { off: off, d: d, min: lista[0].a };
    }
    return null;
  }

  /* Resultado único: {aberto:true, ate} | {off, d, min} | null */
  function estado(hs, agora) {
    var ab = abertoAgora(hs, agora);
    if (ab) return { aberto: true, ate: ab.ate };
    return proxima(hs, agora);
  }

  function rotulo(p) {
    if (!p) return { cls: 'badge-prox', txt: 'Horários a confirmar' };
    if (p.aberto) return { cls: 'badge-hoje', txt: 'Aberto agora' + (p.ate != null ? ' · até ' + fmt(p.ate) : '') };
    if (p.off === 0) return { cls: 'badge-hoje', txt: 'Funciona hoje · abre às ' + fmt(p.min) };
    if (p.off === 1) return { cls: 'badge-prox', txt: 'Amanhã · ' + fmt(p.min) };
    return { cls: 'badge-prox', txt: 'Próxima: ' + DIAS_CURTOS[p.d] + ' · ' + fmt(p.min) };
  }

  /* Fora do navegador (testes automáticos): só expõe a lógica. */
  if (typeof document === 'undefined') {
    globalThis.GDS_LOGICA = { agoraSP: agoraSP, parseHorarios: parseHorarios, estado: estado, rotulo: rotulo, fmt: fmt };
    return;
  }

  var root = document.body.getAttribute('data-root') || './';
  var preview = document.body.getAttribute('data-preview') === '1';

  /* ---------- Aviso de maioridade (+18) ---------- */
  var KEY_MAIOR = 'gds.maior';
  var gate = document.getElementById('gate');
  var travaveis = [].slice.call(document.querySelectorAll('body > header, body > .proto-bar, body > main, body > footer'));
  function travar(v) {
    travaveis.forEach(function (el) { if (v) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
  }
  if (gate && !/(^|\s)maior(\s|$)/.test(document.documentElement.className)) {
    travar(true);
    var sim = document.getElementById('gate-sim');
    if (sim) {
      sim.focus();
      sim.addEventListener('click', function () {
        try { localStorage.setItem(KEY_MAIOR, '1'); } catch (e) { /* sem armazenamento: o aviso volta na próxima página */ }
        document.documentElement.className += ' maior';
        travar(false);
      });
    }
  }

  /* ---------- "Funciona hoje" ---------- */
  function atualizarHoje() {
    var agora = agoraSP();

    document.querySelectorAll('.js-proxima').forEach(function (el) {
      var r = rotulo(estado(parseHorarios(el.getAttribute('data-horarios')), agora));
      el.className = 'badge js-proxima ' + r.cls;
      el.innerHTML = ICONE_RELOGIO + '<span>' + r.txt + '</span>';
    });

    document.querySelectorAll('.js-proxima-box').forEach(function (el) {
      var p = estado(parseHorarios(el.getAttribute('data-horarios')), agora);
      var label = el.querySelector('.pb-label');
      var time = el.querySelector('.pb-time');
      el.classList.toggle('hoje', !!p && (p.aberto || p.off === 0));
      if (!p) { label.textContent = 'Horários'; time.textContent = 'a confirmar'; return; }
      if (p.aberto) { label.textContent = 'Aberto agora'; time.textContent = p.ate != null ? 'até ' + fmt(p.ate) : 'neste momento'; return; }
      if (p.off === 0) { label.textContent = 'Funciona hoje'; time.textContent = 'abre às ' + fmt(p.min); return; }
      label.textContent = 'Próximo dia';
      time.textContent = (p.off === 1 ? 'Amanhã' : DIAS_LONGOS[p.d]) + ' · ' + fmt(p.min);
    });

    document.querySelectorAll('tr[data-dias]').forEach(function (tr) {
      var dias = tr.getAttribute('data-dias').split(',');
      var hoje = dias.indexOf(String(agora.dia)) >= 0;
      tr.classList.toggle('is-hoje', hoje);
      var tag = tr.querySelector('.tag-hoje');
      if (hoje && !tag) {
        var th = tr.querySelector('th');
        if (th) { var s = document.createElement('span'); s.className = 'tag-hoje'; s.textContent = 'hoje'; th.appendChild(s); }
      } else if (!hoje && tag) tag.remove();
    });
  }
  atualizarHoje();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) atualizarHoje(); });
  setInterval(atualizarHoje, 60000);

  /* ---------- Menu de regiões ---------- */
  var mmBtn = document.getElementById('mm-btn');
  var mm = document.getElementById('mm');
  if (mmBtn && mm) {
    var tabs = mm.querySelectorAll('.mm-macros button');
    var panels = mm.querySelectorAll('.mm-panel');
    var selecionar = function (id) {
      tabs.forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-macro') === id ? 'true' : 'false'); });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-macro') !== id; });
    };
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { selecionar(t.getAttribute('data-macro')); });
      t.addEventListener('mouseenter', function () { if (window.matchMedia('(hover: hover)').matches) selecionar(t.getAttribute('data-macro')); });
    });
    var abrir = function (v) {
      mm.hidden = !v;
      mmBtn.setAttribute('aria-expanded', v ? 'true' : 'false');
    };
    mmBtn.addEventListener('click', function (e) { e.stopPropagation(); abrir(mm.hidden); });
    document.addEventListener('click', function (e) { if (!mm.hidden && !mm.contains(e.target)) abrir(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !mm.hidden) { abrir(false); mmBtn.focus(); } });
  }

  /* ---------- Galeria de fotos ---------- */
  document.querySelectorAll('.galeria').forEach(function (g) {
    var main = g.querySelector('.gal-main');
    var thumbs = [].slice.call(g.querySelectorAll('.gal-thumb'));
    if (!main || thumbs.length < 2) return;
    var count = g.querySelector('.gal-count');
    var caixa = g.querySelector('.gal-thumbs');
    var atual = 0;
    function ir(i) {
      atual = (i + thumbs.length) % thumbs.length;
      var t = thumbs[atual];
      main.src = t.getAttribute('data-src');
      main.alt = t.getAttribute('data-alt');
      thumbs.forEach(function (x, n) { x.setAttribute('aria-current', n === atual ? 'true' : 'false'); });
      if (count) count.textContent = (atual + 1) + ' / ' + thumbs.length;
      if (caixa) caixa.scrollLeft = t.offsetLeft - (caixa.clientWidth - t.clientWidth) / 2;
    }
    thumbs.forEach(function (t, n) { t.addEventListener('click', function (e) { e.preventDefault(); ir(n); }); });
    var prev = g.querySelector('.gal-nav.prev');
    var next = g.querySelector('.gal-nav.next');
    if (prev) prev.addEventListener('click', function () { ir(atual - 1); });
    if (next) next.addEventListener('click', function () { ir(atual + 1); });
    g.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { ir(atual - 1); } else if (e.key === 'ArrowRight') { ir(atual + 1); }
    });
    var x0 = null;
    var palco = g.querySelector('.gal-stage');
    palco.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    palco.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 40) ir(atual + (dx < 0 ? 1 : -1));
    });
  });

  /* ---------- Banner de topo em carrossel (transição fade) ---------- */
  var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.fade-car').forEach(function (box) {
    var slides = [].slice.call(box.querySelectorAll('.fade-slide'));
    var dots = [].slice.call(box.querySelectorAll('.fade-dots button'));
    var seg = (parseFloat(box.getAttribute('data-intervalo')) || 6) * 1000;
    var n = 0, timer = null;
    function ir(i) {
      n = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) {
        var on = k === n;
        s.classList.toggle('on', on);
        s.setAttribute('aria-hidden', on ? 'false' : 'true');
        s.tabIndex = on ? 0 : -1;
      });
      dots.forEach(function (d, k) { d.setAttribute('aria-current', k === n ? 'true' : 'false'); });
    }
    function parar() { if (timer) { clearInterval(timer); timer = null; } }
    function iniciar() { if (!timer && !reduz) timer = setInterval(function () { ir(n + 1); }, seg); }
    dots.forEach(function (d, k) { d.addEventListener('click', function () { ir(k); parar(); iniciar(); }); });
    box.addEventListener('mouseenter', parar);
    box.addEventListener('mouseleave', iniciar);
    box.addEventListener('focusin', parar);
    box.addEventListener('focusout', iniciar);
    document.addEventListener('visibilitychange', function () { if (document.hidden) parar(); else iniciar(); });
    iniciar();
  });

  /* ---------- Carrossel de destaques (até 10) ---------- */
  document.querySelectorAll('.dest-wrap').forEach(function (w) {
    var tr = w.querySelector('.dest-track');
    var prev = w.querySelector('.dest-nav.prev');
    var next = w.querySelector('.dest-nav.next');
    function atualizar() {
      var max = tr.scrollWidth - tr.clientWidth;
      var tem = max > 4;
      prev.hidden = !tem; next.hidden = !tem;
      prev.disabled = tr.scrollLeft <= 2;
      next.disabled = tr.scrollLeft >= max - 2;
    }
    prev.addEventListener('click', function () { tr.scrollBy({ left: -tr.clientWidth * 0.9, behavior: 'smooth' }); });
    next.addEventListener('click', function () { tr.scrollBy({ left: tr.clientWidth * 0.9, behavior: 'smooth' }); });
    tr.addEventListener('scroll', atualizar, { passive: true });
    tr.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev.click(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next.click(); }
    });
    window.addEventListener('resize', atualizar);
    atualizar();
  });

  /* ---------- Dados para busca e "Minha lista" ---------- */
  var dados = null;
  var filaDados = [];
  function carregarDados(cb) {
    if (dados) return cb(dados);
    filaDados.push(cb);
    if (filaDados.length > 1) return;
    var s = document.createElement('script');
    s.src = root + 'data/locais.js';
    s.onload = function () { dados = window.GDS_DATA || []; filaDados.splice(0).forEach(function (f) { f(dados); }); };
    s.onerror = function () { dados = []; filaDados.splice(0).forEach(function (f) { f(dados); }); };
    document.head.appendChild(s);
  }
  function link(p) { return root + p + (preview ? 'index.html' : ''); }
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

  /* ---------- Busca ---------- */
  document.querySelectorAll('.js-busca').forEach(function (box) {
    var input = box.querySelector('input');
    var res = box.querySelector('.busca-res');
    var buscar = function () {
      var q = norm(input.value).trim();
      if (q.length < 2) { res.hidden = true; return; }
      carregarDados(function (lista) {
        var achados = lista.filter(function (c) {
          return norm([c.nome, c.tipo, c.bairro, c.cidade, c.regiao, c.kw].join(' ')).indexOf(q) >= 0;
        }).slice(0, 8);
        res.innerHTML = achados.length
          ? achados.map(function (c) {
              return '<li><a href="' + link('local/' + c.slug + '/') + '"><strong>' + esc(c.nome) + '</strong><span>' + esc(c.tipo) + ' · ' + esc(c.bairro) + ' · ' + esc(c.cidade) + '/' + esc(c.uf) + '</span></a></li>';
            }).join('')
          : '<li class="vazio">Nada encontrado ainda. <a href="' + link('cadastre-sua-casa/') + '">Cadastre a sua casa</a></li>';
        res.hidden = false;
      });
    };
    input.addEventListener('input', buscar);
    input.addEventListener('focus', buscar);
    document.addEventListener('click', function (e) { if (!box.contains(e.target)) res.hidden = true; });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') res.hidden = true; });
    var form = box.closest('form');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); var a = res.querySelector('a'); if (a && !res.hidden) location.href = a.href; });
  });

  /* ---------- Minha lista (guardada no aparelho, sem login) ---------- */
  var KEY = 'gds.lista';
  function getLista() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function setLista(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { /* sem armazenamento */ } }
  function pintarSalvos() {
    var lista = getLista();
    document.querySelectorAll('.js-lista-count').forEach(function (el) { el.textContent = lista.length; });
    document.querySelectorAll('.save').forEach(function (b) {
      var on = lista.indexOf(b.getAttribute('data-id')) >= 0;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var nome = b.getAttribute('data-nome') || '';
      b.setAttribute('aria-label', (on ? 'Remover da minha lista: ' : 'Salvar na minha lista: ') + nome);
      var t = b.querySelector('.save-txt');
      if (t) t.textContent = on ? 'Salvo na minha lista' : 'Salvar na minha lista';
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.save') : null;
    if (!b) return;
    e.preventDefault();
    var id = b.getAttribute('data-id');
    var lista = getLista();
    var i = lista.indexOf(id);
    if (i >= 0) lista.splice(i, 1); else lista.push(id);
    setLista(lista);
    pintarSalvos();
    if (document.getElementById('minha-lista')) desenharMinhaLista();
  });
  pintarSalvos();

  function desenharMinhaLista() {
    var alvo = document.getElementById('minha-lista');
    if (!alvo) return;
    var ids = getLista();
    carregarDados(function (lista) {
      var agora = agoraSP();
      var itens = lista.filter(function (c) { return ids.indexOf(c.id) >= 0; });
      if (!itens.length) {
        alvo.innerHTML = '<div class="vazio-msg"><p>Você ainda não salvou nenhum lugar.</p><p>Use o coração nos cartões para guardar os seus favoritos neste aparelho.</p><a class="btn" href="' + link('') + '">Escolher uma região</a></div>';
        return;
      }
      alvo.innerHTML = '<div class="grid-cards">' + itens.map(function (c) {
        var r = rotulo(estado(parseHorarios(c.horarios), agora));
        return '<div class="card-wrap"><a class="card" href="' + link('local/' + c.slug + '/') + '">' +
          '<span class="card-title"><span class="nome">' + esc(c.nome) + '</span><span class="sub">' + esc(c.tipo) + '</span></span>' +
          '<span class="card-loc">' + esc(c.bairro) + ' · ' + esc(c.cidade) + '/' + esc(c.uf) + '</span>' +
          '<span class="card-badges"><span class="badge ' + r.cls + '">' + ICONE_RELOGIO + '<span>' + r.txt + '</span></span></span></a>' +
          '<button type="button" class="save on" data-id="' + esc(c.id) + '" data-nome="' + esc(c.nome) + '" aria-pressed="true" aria-label="Remover da minha lista: ' + esc(c.nome) + '"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path class="heart" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button></div>';
      }).join('') + '</div>';
    });
  }
  desenharMinhaLista();
})();
