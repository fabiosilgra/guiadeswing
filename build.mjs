// Gerador do site Guia de Swing.
//
//   node build.mjs            -> gera a pasta dist/ (versão para publicar)
//   node build.mjs --preview  -> gera dist-preview/ (abre direto no computador, sem servidor)
//
// Lê a planilha dados/guia-de-swing.xlsx (abas "Locais" e "Horarios") e os arquivos
// dados/*.json, e gera páginas HTML estáticas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  esc, slugify, sim, parseDias, labelDias, jsDia, DIAS,
  parseFaixa, fmtFaixa, hhmm, fmtData, parseLista, parsePares, ehUrl, fmtDataCurta, idadeDias
} from './build/lib.mjs';
import { lerXlsx, horaExcel, dataExcel } from './build/xlsx.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const PREVIEW = args.includes('--preview');
const outArg = args.find((a) => a.startsWith('--out='));
const OUT = path.resolve(ROOT, outArg ? outArg.slice(6) : PREVIEW ? 'dist-preview' : 'dist');

const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const avisos = [];
const warn = (m) => avisos.push(m);

/* =====================================================================
   1. Carregar e validar os dados
   ===================================================================== */
const cfg = readJSON('dados/config.json');
const geo = readJSON('dados/regioes.json');
const banners = readJSON('dados/banners.json');

const estados = {};
for (const m of geo.macro) {
  for (const uf of m.estados) {
    const e = geo.estados[uf];
    if (!e) { warn(`regioes.json: estado ${uf} listado em "${m.nome}" mas sem definição.`); continue; }
    estados[uf] = { uf, nome: e.nome, macro: m.nome, regioes: e.regioes.map((n) => ({ nome: n, slug: slugify(n) })) };
  }
}

// "em São Paulo", "no Rio de Janeiro", "na Bahia" (para títulos e textos)
const EM_ESTADO = {
  RJ: 'no Rio de Janeiro', ES: 'no Espírito Santo', PR: 'no Paraná', RS: 'no Rio Grande do Sul', BA: 'na Bahia',
  CE: 'no Ceará', PB: 'na Paraíba', MA: 'no Maranhão', RN: 'no Rio Grande do Norte', PI: 'no Piauí', DF: 'no Distrito Federal',
  AM: 'no Amazonas', PA: 'no Pará', AC: 'no Acre', AP: 'no Amapá', TO: 'no Tocantins'
};
const emEstado = (uf) => EM_ESTADO[uf] || `em ${estados[uf].nome}`;
const emRegiao = (nome) => (/^zona\b/i.test(nome) ? `na ${nome}` : /^centro\b/i.test(nome) ? `no ${nome}` : `em ${nome}`);

/* Tipos de lugar (a coluna "tipo" da planilha) */
const TIPOS = {
  'casa-de-swing': { um: 'Casa de swing', varios: 'Casas de swing' },
  'balada-liberal': { um: 'Balada liberal', varios: 'Baladas liberais' },
  'clube-liberal': { um: 'Clube liberal', varios: 'Clubes liberais' },
  'sauna-liberal': { um: 'Sauna liberal', varios: 'Saunas liberais' },
  prive: { um: 'Privê', varios: 'Privês' },
  'motel-liberal': { um: 'Motel com ambiente liberal', varios: 'Motéis com ambiente liberal' },
  outro: { um: 'Espaço liberal', varios: 'Espaços liberais' }
};

const arqPlanilha = cfg.fontes.planilha || 'dados/guia-de-swing.xlsx';
if (!fs.existsSync(path.join(ROOT, arqPlanilha))) {
  throw new Error(`Não encontrei a planilha "${arqPlanilha}". Ela precisa estar na pasta dados/ com as abas "Locais" e "Horarios".`);
}
const abas = lerXlsx(fs.readFileSync(path.join(ROOT, arqPlanilha)));
const achar = (n) => abas[Object.keys(abas).find((k) => slugify(k) === n)];
const aL = achar('locais'), aH = achar('horarios');
if (!aL || !aH) throw new Error('A planilha precisa ter as abas "Locais" e "Horarios".');
const txt = (o, dataCols = [], horaCols = []) => Object.fromEntries(Object.entries(o).map(([k, v]) =>
  [k, dataCols.includes(k) ? dataExcel(v) : horaCols.includes(k) ? horaExcel(v) : String(v ?? '').trim()]));
let rowsL = aL.map((o) => txt(o, ['confirmado_em']));
let rowsH = aH.map((o) => txt(o, [], ['hora']));
// só entra no site quem tem "publicar" = sim
const totalLinhas = rowsL.length;
rowsL = rowsL.filter((r) => sim(r.publicar));
const despublicados = totalLinhas - rowsL.length;
const pub = new Set(rowsL.map((r) => r.id));
rowsH = rowsH.filter((r) => pub.has(r.id_local));
if (!rowsL.length) warn('A planilha ainda não tem nenhum lugar com "publicar = SIM"; o site foi gerado vazio.');

const ids = new Set();
const slugs = new Set();
const locais = [];
for (const r of rowsL) {
  if (!r.id || !r.nome) { warn(`Locais: linha sem "id" ou "nome" ignorada (${JSON.stringify(r).slice(0, 70)}...)`); continue; }
  if (ids.has(r.id)) { warn(`Locais: id repetido "${r.id}" — a segunda linha foi ignorada.`); continue; }
  const uf = (r.uf || '').toUpperCase();
  if (!estados[uf]) { warn(`Locais: "${r.nome}" tem UF "${r.uf}" desconhecida — linha ignorada.`); continue; }
  ids.add(r.id);
  const reg = estados[uf].regioes.find((x) => slugify(x.nome) === slugify(r.regiao));
  if (!reg) warn(`Locais: "${r.nome}" (${r.id}) usa a região "${r.regiao}", que não existe em ${uf}. Confira dados/regioes.json.`);
  // aceita o código ("casa-de-swing"), o nome ("Casa de swing") ou o plural ("Casas de swing")
  const tipoDigitado = slugify(r.tipo);
  let tipoSlug = Object.keys(TIPOS).find((k) => k === tipoDigitado || slugify(TIPOS[k].um) === tipoDigitado || slugify(TIPOS[k].varios) === tipoDigitado) || tipoDigitado;
  if (!TIPOS[tipoSlug]) {
    warn(`Locais: "${r.nome}" (${r.id}) tem o tipo "${r.tipo}", que não conheço — usei "Espaço liberal". Tipos aceitos: ${Object.values(TIPOS).map((t) => t.um).join(', ')}.`);
    tipoSlug = 'outro';
  }
  let slug = slugify(`${r.nome}-${r.bairro}`);
  if (slugs.has(slug)) slug += '-' + slugify(r.id);
  slugs.add(slug);
  locais.push({
    ...r, uf, slug, tipoSlug, tipoNome: TIPOS[tipoSlug].um,
    regiaoSlug: reg ? reg.slug : slugify(r.regiao),
    regiaoNome: reg ? reg.nome : r.regiao,
    destaque: sim(r.destaque),
    exemplo: sim(r.exemplo),
    fotos: parseLista(r.fotos),
    valores: parsePares(r.valores),
    regras: parseLista(r.regras),
    ambiente: parseLista(r.ambiente),
    horarios: { funcionamento: [], festa: [], atendimento: [] }
  });
}
const porId = Object.fromEntries(locais.map((c) => [c.id, c]));

const TIPOS_HOR = { funcionamento: 'Funcionamento', festa: 'Festas e noites temáticas', atendimento: 'Atendimento e reservas' };
const ALIAS_HOR = { festas: 'festa', evento: 'festa', eventos: 'festa', reserva: 'atendimento', reservas: 'atendimento', abre: 'funcionamento', aberto: 'funcionamento' };
for (const h of rowsH) {
  const c = porId[h.id_local];
  const ref = `Horarios (${h.id_local} · ${h.tipo} · ${h.dias} · ${h.hora})`;
  if (!c) { warn(`${ref}: não existe lugar com esse id na aba Locais.`); continue; }
  let tipo = slugify(h.tipo || 'funcionamento');
  tipo = ALIAS_HOR[tipo] || tipo;
  if (!TIPOS_HOR[tipo]) { warn(`${ref}: tipo desconhecido (use funcionamento, festa ou atendimento).`); continue; }
  const dias = parseDias(h.dias);
  if (!dias.length) { warn(`${ref}: não entendi os dias "${h.dias}" (exemplos: sex-sab, dom, ter,qui, todos).`); continue; }
  const faixa = parseFaixa(h.hora);
  if (!faixa) { warn(`${ref}: não entendi a hora "${h.hora}" (exemplos: 22:00 ou 22:00-05:00).`); continue; }
  c.horarios[tipo].push({ dias, faixa, obs: h.obs || '' });
}
for (const c of locais) {
  c.capa = c.fotos[0] || '';
  for (const f of c.fotos) {
    if (ehUrl(f)) continue;
    const arq = path.join(ROOT, f);
    if (!fs.existsSync(arq)) { warn(`"${c.nome}" (${c.id}): a foto "${f}" não foi encontrada. Confira o nome e se o arquivo foi enviado.`); continue; }
    const kb = Math.round(fs.statSync(arq).size / 1024);
    if (kb > 600) warn(`"${c.nome}" (${c.id}): a foto "${f}" tem ${kb} KB. Reduza para até ~300 KB para o site abrir rápido no celular.`);
  }
  if (!c.exemplo) {
    const dias = idadeDias(c.confirmado_em);
    if (dias == null) warn(`"${c.nome}" (${c.id}): sem data em "confirmado_em" — o site mostrará "informações a confirmar".`);
    else if (dias > 90) warn(`"${c.nome}" (${c.id}): informações confirmadas há ${dias} dias. Vale pedir reconfirmação à casa.`);
    if (!sim(c.autorizado)) warn(`"${c.nome}" (${c.id}): sem "autorizado = SIM". Combine a divulgação com a casa antes de lançar o site.`);
    if (!c.sobre) warn(`"${c.nome}" (${c.id}): sem texto em "sobre". Um texto de 2 a 3 parágrafos ajuda muito no Google.`);
  }
  if (!c.horarios.funcionamento.length) warn(`"${c.nome}" (${c.id}) ainda não tem horários de funcionamento.`);
  c.tokens = [...new Set(c.horarios.funcionamento.flatMap((m) =>
    m.dias.map((d) => `${jsDia(d)}@${hhmm(m.faixa.a)}-${m.faixa.b == null ? '' : hhmm(m.faixa.b)}`)))].join(' ');
}

/* Índices */
const ativosUF = new Set(locais.map((c) => c.uf));
const regAtivas = {};
const tiposPorUf = {};
for (const c of locais) {
  (regAtivas[c.uf] ??= new Set()).add(c.regiaoSlug);
  (tiposPorUf[c.uf] ??= new Set()).add(c.tipoSlug);
}
const ordenar = (lista) =>
  [...lista].sort((a, b) =>
    (b.destaque ? 1 : 0) - (a.destaque ? 1 : 0) ||
    a.cidade.localeCompare(b.cidade, 'pt-BR') ||
    a.bairro.localeCompare(b.bairro, 'pt-BR') ||
    a.nome.localeCompare(b.nome, 'pt-BR'));

/* =====================================================================
   2. Peças de HTML
   ===================================================================== */
let CTX;
function mkctx(depth, abs) {
  if (abs != null) return { root: abs, a: (p) => abs + p, u: (p = '') => abs + p };
  const root = depth ? '../'.repeat(depth) : './';
  return {
    root,
    a: (p) => root + p,
    u: (p = '') => root + p + (PREVIEW && (p === '' || p.endsWith('/')) ? 'index.html' : '')
  };
}

const svgPin = (size, cor = '#F0030C', furo = '#fff') =>
  `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><path d="M32 3C18.7 3 8 13.4 8 26.4C8 43 27 57.5 32 62C37 57.5 56 43 56 26.4C56 13.4 45.3 3 32 3Z" fill="${cor}"/><circle cx="32" cy="26" r="9.5" fill="${furo}"/></svg>`;
const ICON = {
  chevron: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#5E5B5C" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  pin: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#5E5B5C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  phone: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#5E5B5C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
  globe: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#5E5B5C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>',
  mail: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#5E5B5C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  clockSm: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path class="heart" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
  heartSm: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#F0030C" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
};

const fotoSrc = (p) => (ehUrl(p) ? p : CTX.a(String(p).replace(/^\/+/, '')));

/* Selo de confirmação das informações. curto=true nos cartões, completo na página do lugar. */
function seloConfirmacao(c, curto = false) {
  const iso = c.confirmado_em;
  const dias = idadeDias(iso);
  if (dias == null) {
    return `<span class="badge-pend" title="A casa ainda não confirmou as informações">${ICON.clockSm}${curto ? 'a confirmar' : 'Informações ainda não confirmadas pela casa'}</span>`;
  }
  if (dias > 120) {
    return `<span class="badge-velho" title="Confirmado em ${fmtData(iso)}. Pode estar desatualizado.">${ICON.clockSm}${curto ? `confirmado em ${fmtDataCurta(iso)}` : `Confirmado em ${fmtData(iso)} · reconfirmar com a casa`}</span>`;
  }
  return `<span class="badge-ok">${ICON.check}${curto ? `confirmado em ${fmtDataCurta(iso)}` : `Informações confirmadas em ${fmtData(iso)}`}</span>`;
}

const wa = (msg) => `https://wa.me/${cfg.whatsapp}?text=${encodeURIComponent(msg)}`;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

function banner(pos) {
  const b = banners[pos];
  if (!b) return '';
  const [w, h] = (b.tamanho.match(/\d+/g) || []).map(Number);
  if (b.img) {
    return `<a class="ad ad-${pos}" href="${esc(b.link || '#')}" target="_blank" rel="sponsored noopener"><span class="ad-tag">publicidade</span><img src="${esc(CTX.a(b.img))}" alt="${esc(b.alt || 'Publicidade')}" width="${w}" height="${h}" loading="lazy"></a>`;
  }
  return `<a class="ad vazio ad-${pos}" style="aspect-ratio:${w}/${h}" href="${esc(CTX.u('anuncie/'))}"><span class="ad-tag">publicidade</span><b>Anuncie aqui</b><small>${esc(b.tamanho)} px</small></a>`;
}

function menuHtml(ufAtual) {
  const macroAtual = ufAtual && estados[ufAtual] ? estados[ufAtual].macro : geo.macro[0].nome;
  const tabs = geo.macro.map((m) =>
    `<li><button type="button" role="tab" data-macro="${slugify(m.nome)}" aria-selected="${m.nome === macroAtual}">${esc(m.nome)}</button></li>`).join('');
  const panels = geo.macro.map((m) => {
    const cols = m.estados.filter((uf) => estados[uf]).map((uf) => {
      const e = estados[uf];
      if (!ativosUF.has(uf)) {
        return `<div class="mm-estado"><h3 class="soon">${esc(e.nome)}<small>em breve</small></h3></div>`;
      }
      const regs = e.regioes.map((r) => regAtivas[uf].has(r.slug)
        ? `<li><a href="${CTX.u(`${uf.toLowerCase()}/${r.slug}/`)}">${esc(r.nome)}</a></li>`
        : `<li><span class="soon" title="Em breve">${esc(r.nome)}</span></li>`).join('');
      return `<div class="mm-estado"><h3><a href="${CTX.u(uf.toLowerCase() + '/')}">${esc(e.nome)}</a></h3><ul>${regs}</ul></div>`;
    }).join('');
    return `<div class="mm-panel" role="tabpanel" data-macro="${slugify(m.nome)}"${m.nome === macroAtual ? '' : ' hidden'}><div class="mm-cols">${cols}</div></div>`;
  }).join('');
  return `<div class="mm" id="mm" hidden><div class="mm-box"><div class="mm-card"><ul class="mm-macros" role="tablist" aria-label="Macrorregiões">${tabs}</ul><div class="mm-panels">${panels}</div></div></div></div>`;
}

function buscaHtml(id, placeholder) {
  return `<form class="busca js-busca" role="search" action="#"><label class="sr-only" for="${id}">Buscar casa, bairro ou cidade</label>${ICON.search}<input id="${id}" type="search" autocomplete="off" placeholder="${esc(placeholder)}"><ul class="busca-res" hidden></ul></form>`;
}

function gateHtml() {
  return `<div class="gate" id="gate" role="dialog" aria-modal="true" aria-labelledby="gate-t"><div class="gate-box">
<img src="${CTX.a('assets/logo.png')}" alt="${esc(cfg.nome)}" width="170" height="72">
<h2 id="gate-t">Conteúdo para maiores de 18 anos</h2>
<p>O ${esc(cfg.nome)} reúne informações sobre casas, baladas e clubes do meio liberal e é destinado exclusivamente a <strong>maiores de 18 anos</strong>. Não exibimos imagens explícitas.</p>
<div class="gate-btns"><button type="button" class="btn" id="gate-sim">Tenho 18 anos ou mais — entrar</button><a class="btn sec" href="https://www.google.com.br" rel="noopener">Sou menor de 18 — sair</a></div>
<small>Ao entrar, você declara ser maior de idade e ter ciência de que o conteúdo trata de ambientes para adultos.</small>
</div></div>`;
}

function header(ufAtual, opts = {}) {
  const label = ufAtual && estados[ufAtual] ? estados[ufAtual].nome : 'Escolha a região';
  const proto = cfg.lancado ? '' : `<div class="proto-bar">Versão de testes · os dados desta versão são de exemplo e não devem ser usados como informação real</div>`;
  return `${proto}<header class="hdr"><div class="hdr-in">
<a class="logo" href="${CTX.u('')}" aria-label="${esc(cfg.nome)}, página inicial"><img src="${CTX.a('assets/logo.png')}" alt="${esc(cfg.nome)}" width="118" height="50"></a>
<button type="button" class="mm-btn" id="mm-btn" aria-expanded="false" aria-controls="mm">${esc(label)}${ICON.chevron}</button>
${opts.semBusca ? '' : buscaHtml('q-topo', 'Digite o nome da casa, bairro ou cidade')}
<nav aria-label="Principal"><a class="lista-link" href="${CTX.u('minha-lista/')}">${ICON.heartSm}<span>Minha lista (<span class="js-lista-count">0</span>)</span></a><a class="btn-cta" href="${CTX.u('cadastre-sua-casa/')}">Cadastre sua casa</a></nav>
</div>${menuHtml(ufAtual)}</header>`;
}

function footer() {
  const insta = cfg.instagram ? `<a href="${esc(cfg.instagram)}" rel="noopener">Instagram</a>` : '';
  return `<footer class="ftr"><div class="ftr-in"><div class="ftr-top">
<div><span class="wordmark">${svgPin(30)}<span>guia de <em>swing</em></span></span><p>${esc(cfg.slogan)}: horários, valores, regras de entrada e endereços.</p></div>
<div class="ftr-cols">
<div><b>Para casas</b><a href="${CTX.u('cadastre-sua-casa/')}">Cadastre sua casa</a><a href="${CTX.u('cadastre-sua-casa/')}">Atualizar informações</a></div>
<div><b>Anuncie</b><a href="${CTX.u('anuncie/')}">Espaços e preços</a><a href="${esc(wa('Olá! Quero falar sobre o Guia de Swing.'))}">Fale conosco</a></div>
<div><b>Site</b><a href="${CTX.u('sobre/')}">Sobre o projeto</a><a href="${CTX.u('privacidade/')}">Privacidade</a>${insta}</div>
</div></div>
<div class="ftr-fim"><strong>Conteúdo exclusivo para maiores de 18 anos.</strong> Projeto independente. Horários, valores e regras são informados pelas próprias casas e podem mudar: confirme antes de ir. Respeite sempre as regras de cada casa e o consentimento de todas as pessoas. © ${new Date().getFullYear()} ${esc(cfg.nome)}.</div>
</div></footer>`;
}

function layout({ title, desc, canonical, noindex, body, jsonld, uf, semBusca, keywords }) {
  const full = title ? `${title} | ${cfg.nome}` : `${cfg.nome} — ${cfg.slogan}`;
  const bloquear = noindex || !cfg.lancado;
  const og = fs.existsSync(path.join(ROOT, 'assets/og.png')) ? `<meta property="og:image" content="${esc(cfg.siteUrl + '/assets/og.png')}">` : '';
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>try{if(localStorage.getItem('gds.maior')==='1')document.documentElement.className+=' maior'}catch(e){}</script>
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc || cfg.slogan)}">
${keywords ? `<meta name="keywords" content="${esc(keywords)}">` : ''}
<meta name="rating" content="adult">
<meta name="RATING" content="RTA-5042-1996-1400-1577-RTA">
${bloquear ? '<meta name="robots" content="noindex, nofollow">' : ''}
${canonical != null ? `<link rel="canonical" href="${esc(cfg.siteUrl + canonical)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="${esc(cfg.nome)}">
<meta property="og:title" content="${esc(full)}">
<meta property="og:description" content="${esc(desc || cfg.slogan)}">
${og}
<meta name="theme-color" content="#0E0E10">
<link rel="icon" href="${CTX.a('assets/favicon.svg')}" type="image/svg+xml">
<link rel="apple-touch-icon" href="${CTX.a('assets/apple-touch-icon.png')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&amp;family=Figtree:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="${CTX.a('assets/style.css')}">
<noscript><style>.gate{display:none!important}html:not(.maior) body{overflow:auto!important}</style></noscript>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head>
<body data-root="${esc(CTX.root)}" data-preview="${PREVIEW ? 1 : 0}">
${header(uf, { semBusca })}
<main>
${body}
</main>
${footer()}
${gateHtml()}
<script src="${CTX.a('assets/app.js')}" defer></script>
</body>
</html>
`;
}

function cardHtml(c) {
  const selo = seloConfirmacao(c, true) + (c.exemplo ? '<span class="badge-ex">exemplo</span>' : '');
  return `<div class="card-wrap"><a class="card" href="${CTX.u(`local/${c.slug}/`)}">
<span class="card-top"><span class="avatar">${c.capa ? `<img src="${esc(fotoSrc(c.capa))}" alt="" loading="lazy">` : svgPin(30, '#F0030C', '#fff')}</span>
<span class="card-title"><span class="nome">${esc(c.nome)}</span><span class="sub">${esc(c.tipoNome)}</span></span></span>
<span class="card-loc">${ICON.pin}${esc(c.bairro)} · ${esc(c.cidade)}</span>
<span class="card-badges"><span class="badge badge-prox js-proxima" data-horarios="${esc(c.tokens)}">${ICON.clockSm}<span>Ver horários</span></span>${selo}</span>
<span class="card-links">horários &middot; valores &middot; regras de entrada &middot; como chegar</span>
</a><button type="button" class="save" data-id="${esc(c.id)}" data-nome="${esc(c.nome)}" aria-pressed="false" aria-label="Salvar na minha lista: ${esc(c.nome)}">${ICON.heart}</button></div>`;
}

function destaqueHtml(c) {
  return `<a class="destaque" href="${CTX.u(`local/${c.slug}/`)}">${c.capa ? `<img src="${esc(fotoSrc(c.capa))}" alt="" loading="lazy">` : `<span class="destaque-pin" aria-hidden="true">${svgPin(150, '#F0030C', '#1B1B1F')}</span>`}<span class="selo">Destaque</span><span class="leg"><b>${esc(c.nome)}</b><span>${esc(c.tipoNome)} · ${esc(c.bairro)}</span></span></a>`;
}

/* =====================================================================
   3. Páginas
   ===================================================================== */
const paginas = []; // { rel, html, url?, indexar }

function emitir(rel, html, url, indexar = false) {
  paginas.push({ rel, html, url, indexar });
}

function paginaEntrada() {
  CTX = mkctx(0);
  const estadosHtml = geo.macro.flatMap((m) => m.estados).filter((uf) => estados[uf]).map((uf) => {
    const e = estados[uf];
    const ativo = ativosUF.has(uf);
    const n = locais.filter((c) => c.uf === uf).length;
    const regs = ativo
      ? e.regioes.filter((r) => regAtivas[uf].has(r.slug)).map((r) => `<a href="${CTX.u(`${uf.toLowerCase()}/${r.slug}/`)}">${esc(r.nome)}</a>`).join(' &middot; ')
      : '';
    return `<div class="estado${ativo ? '' : ' soon'}"><span class="estado-badge" aria-hidden="true">${uf}</span><div>
<h3>${ativo ? `<a href="${CTX.u(uf.toLowerCase() + '/')}">${esc(e.nome)}</a>` : esc(e.nome)}</h3>
<p>${ativo ? `${regs}<br>${plural(n, 'lugar', 'lugares')}` : 'Em breve'}</p></div></div>`;
  }).join('');

  const tiposHtml = [...ativosUF].map((uf) => {
    const chips = Object.keys(TIPOS).filter((t) => tiposPorUf[uf].has(t))
      .map((t) => `<a class="chip" href="${CTX.u(`${uf.toLowerCase()}/tipo/${t}/`)}">${esc(TIPOS[t].varios)}</a>`).join(' ');
    return `<div class="linha-chips"><span class="rot">${esc(estados[uf].nome)}</span>${chips}</div>`;
  }).join('');

  const body = `
<section class="hero"><div class="wrap">
<h1>${esc(cfg.slogan)}</h1>
<p>Horários, valores, regras de entrada e endereços das casas do meio liberal, sempre à mão.</p>
${buscaHtml('q-hero', 'Digite o nome da casa, bairro ou cidade')}
</div></section>
<div class="wrap">
<section class="card-regiao"><h2>Escolha uma região</h2><div class="estados">${estadosHtml}</div></section>
<section class="bloco"><h2>Ou escolha pelo tipo de lugar</h2><p>Casas de swing, baladas liberais, clubes e outros ambientes para adultos.</p>${tiposHtml || '<span class="chip soon">Em breve</span>'}</section>
<section class="bloco"><h2>A sua casa ainda não está aqui?</h2><p>O cadastro é gratuito. Envie horários, valores e regras de entrada e a sua casa passa a aparecer para quem procura na região.</p><a class="btn-cta" style="display:inline-block" href="${CTX.u('cadastre-sua-casa/')}">Cadastre sua casa</a></section>
<div style="margin-top:22px">${banner('rodape')}</div>
</div>`;
  emitir('index.html', layout({
    title: '', desc: `${cfg.slogan}. Casas de swing, baladas liberais e clubes por estado e região, com horários, valores e regras de entrada.`,
    canonical: '/', body, semBusca: true
  }), '/', true);
}

function listagem({ depth, rel, uf, kicker, h1, crumbs, lista, regSel, tipoSel, title, desc, canonicalPath }) {
  CTX = mkctx(depth);
  const e = estados[uf];
  const base = uf.toLowerCase();
  const chipsReg = [
    `<a class="chip${!regSel && !tipoSel ? ' sel' : ''}" href="${CTX.u(base + '/')}">Todas</a>`,
    ...e.regioes.map((r) => regAtivas[uf]?.has(r.slug)
      ? `<a class="chip${regSel === r.slug ? ' sel' : ''}" href="${CTX.u(`${base}/${r.slug}/`)}">${esc(r.nome)}</a>`
      : `<span class="chip soon" title="Em breve">${esc(r.nome)}</span>`)
  ].join('');
  const tiposUf = Object.keys(TIPOS).filter((t) => tiposPorUf[uf]?.has(t));
  const chipsTipo = tiposUf.length
    ? [`<a class="chip${!tipoSel && !regSel ? ' sel' : ''}" href="${CTX.u(base + '/')}">Todos</a>`,
       ...tiposUf.map((t) => `<a class="chip${tipoSel === t ? ' sel' : ''}" href="${CTX.u(`${base}/tipo/${t}/`)}">${esc(TIPOS[t].varios)}</a>`)].join('')
    : '';

  const ordenada = ordenar(lista);
  const dest = ordenada.filter((c) => c.destaque).slice(0, 3);

  const body = `
<div class="faixa"><div class="faixa-in">
<div class="linha-chips"><span class="rot">Regiões</span>${chipsReg}</div>
${chipsTipo ? `<div class="linha-chips"><span class="rot">Tipos</span>${chipsTipo}</div>` : ''}
</div></div>
<div class="conteudo">
<nav class="migalha" aria-label="Você está em">${crumbs}</nav>
<div><p class="kicker">${esc(kicker)}</p><h1 class="titulo">${esc(h1)}</h1></div>
${banner('topo')}
${dest.length ? `<section style="display:flex;flex-direction:column;gap:14px"><div class="sec-tit"><h2 class="sec">Destaques</h2></div><div class="destaques">${dest.map(destaqueHtml).join('')}</div></section>` : ''}
<div class="duas-col">
<section class="col-main"><div class="sec-tit"><h2 class="sec">Casas e horários</h2><span>${plural(ordenada.length, 'lugar', 'lugares')}</span></div>
<div class="grid-cards">${ordenada.map(cardHtml).join('')}</div></section>
<aside class="col-side" aria-label="Publicidade">${banner('lateral1')}</aside>
</div>
${banner('rodape')}
</div>`;
  const exemplo = lista.every((c) => c.exemplo);
  emitir(rel, layout({ title, desc, canonical: canonicalPath, body, uf, noindex: exemplo }), canonicalPath, !exemplo);
}

const migalhaBase = () => `<a href="${CTX.u('')}">Início</a><span aria-hidden="true">›</span>`;

function paginasListagem() {
  for (const uf of ativosUF) {
    const e = estados[uf];
    const base = uf.toLowerCase();
    const doEstado = locais.filter((c) => c.uf === uf);
    // Estado
    listagem({
      depth: 1, rel: `${base}/index.html`, uf, kicker: 'Casas de swing e baladas liberais', h1: e.nome,
      crumbs: (CTX = mkctx(1), `${migalhaBase()}<span>${esc(e.nome)}</span>`), lista: doEstado,
      title: `Casas de swing e baladas liberais ${emEstado(uf)}`,
      desc: `Casas de swing, baladas liberais e clubes ${emEstado(uf)}: horários, valores, regras de entrada e endereços.`,
      canonicalPath: `/${base}/`
    });
    // Regiões
    for (const r of e.regioes.filter((x) => regAtivas[uf].has(x.slug))) {
      const lista = doEstado.filter((c) => c.regiaoSlug === r.slug);
      listagem({
        depth: 2, rel: `${base}/${r.slug}/index.html`, uf, regSel: r.slug, kicker: 'Casas de swing e baladas liberais', h1: `${r.nome}, ${e.nome}`,
        crumbs: (CTX = mkctx(2), `${migalhaBase()}<a href="${CTX.u(base + '/')}">${esc(e.nome)}</a><span aria-hidden="true">›</span><span>${esc(r.nome)}</span>`),
        lista, title: `Casas de swing e baladas liberais ${emRegiao(r.nome)}, ${e.nome}`,
        desc: `${plural(lista.length, 'casa liberal', 'casas liberais')} ${emRegiao(r.nome)}, ${e.nome}: horários de funcionamento, valores, regras de entrada e como chegar.`,
        canonicalPath: `/${base}/${r.slug}/`
      });
    }
    // Tipos (ex.: /sp/tipo/casa-de-swing/)
    for (const t of Object.keys(TIPOS).filter((x) => tiposPorUf[uf].has(x))) {
      const lista = doEstado.filter((c) => c.tipoSlug === t);
      listagem({
        depth: 3, rel: `${base}/tipo/${t}/index.html`, uf, tipoSel: t, kicker: 'Lugares do tipo', h1: `${TIPOS[t].varios} ${emEstado(uf)}`,
        crumbs: (CTX = mkctx(3), `${migalhaBase()}<a href="${CTX.u(base + '/')}">${esc(e.nome)}</a><span aria-hidden="true">›</span><span>${esc(TIPOS[t].varios)}</span>`),
        lista, title: `${TIPOS[t].varios} ${emEstado(uf)}`,
        desc: `${TIPOS[t].varios} ${emEstado(uf)}: horários, valores, regras de entrada e endereços de ${plural(lista.length, 'lugar', 'lugares')}.`,
        canonicalPath: `/${base}/tipo/${t}/`
      });
    }
  }
}

/* ---------- Página do lugar ---------- */
function agrupar(entradas) {
  const mapa = new Map();
  for (const x of entradas) {
    const k = x.dias.join(',');
    if (!mapa.has(k)) mapa.set(k, { dias: x.dias, itens: [] });
    mapa.get(k).itens.push(x);
  }
  const linhas = [...mapa.values()];
  linhas.sort((a, b) => DIAS.indexOf(a.dias[0]) - DIAS.indexOf(b.dias[0]) || b.dias.length - a.dias.length);
  linhas.forEach((l) => l.itens.sort((x, y) => x.faixa.a - y.faixa.a));
  return linhas;
}
const celula = (l) => l.itens.map((i) => `<span class="hora">${fmtFaixa(i.faixa)}${i.obs ? ` <small>${esc(i.obs)}</small>` : ''}</span>`).join('');
const linhaHtml = (l, extra = '') =>
  `<tr data-dias="${l.dias.map(jsDia).join(',')}"><th scope="row">${esc(labelDias(l.dias))}${extra ? `<small>${esc(extra)}</small>` : ''}</th><td>${celula(l)}</td></tr>`;

function paginaLocal(c) {
  CTX = mkctx(2);
  const e = estados[c.uf];
  const base = c.uf.toLowerCase();
  const urlAbs = `${cfg.siteUrl}/local/${c.slug}/`;
  const consulta = c.endereco ? `${c.endereco}, ${c.cidade} - ${c.uf}` : `${c.nome}, ${c.bairro}, ${c.cidade} - ${c.uf}`;
  const mapaUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(consulta)}`;
  const wazeUrl = `https://waze.com/ul?q=${encodeURIComponent(consulta)}&navigate=yes`;
  const contatos = [
    `<li>${ICON.pin}<span>${esc(c.endereco || `${c.bairro}, ${c.cidade} - ${c.uf}`)}${c.endereco ? '' : ' <em style="color:#5E5B5C">(endereço completo em breve)</em>'} · <a href="${mapaUrl}" target="_blank" rel="noopener">ver no mapa</a></span></li>`,
    c.telefone ? `<li>${ICON.phone}<a href="tel:${esc(c.telefone.replace(/[^\d+]/g, ''))}">${esc(c.telefone)}</a></li>` : '',
    c.whatsapp ? `<li>${ICON.phone}<a href="https://wa.me/${esc(c.whatsapp.replace(/\D/g, ''))}" rel="noopener">WhatsApp da casa</a></li>` : '',
    c.email ? `<li>${ICON.mail}<a href="mailto:${esc(c.email)}">${esc(c.email)}</a></li>` : '',
    c.site ? `<li>${ICON.globe}<a href="${esc(c.site)}" target="_blank" rel="noopener">${esc(c.site.replace(/^https?:\/\//, ''))}</a></li>` : '',
    c.instagram ? `<li>${ICON.globe}<a href="${esc(c.instagram)}" target="_blank" rel="noopener">Instagram</a></li>` : ''
  ].join('');

  const selo = `<div class="selos">${seloConfirmacao(c)}${c.exemplo ? '<span class="badge-ex">dados de exemplo</span>' : ''}</div>`;

  /* Galeria de fotos (fachada e ambiente, nunca pessoas) */
  const fotos = [...new Set(c.fotos)];
  const galeria = fotos.length
    ? `<section class="secao galeria" aria-label="Fotos de ${esc(c.nome)}">
<div class="gal-stage"><img class="gal-main" src="${esc(fotoSrc(fotos[0]))}" alt="${esc(`Foto 1 de ${fotos.length} — ${c.nome}`)}" width="1200" height="750">
${fotos.length > 1 ? `<button type="button" class="gal-nav prev" aria-label="Foto anterior"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button><button type="button" class="gal-nav next" aria-label="Próxima foto"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button><span class="gal-count" aria-live="polite">1 / ${fotos.length}</span>` : ''}</div>
${fotos.length > 1 ? `<div class="gal-thumbs">${fotos.map((f, i) => `<a class="gal-thumb" href="${esc(fotoSrc(f))}" data-src="${esc(fotoSrc(f))}" data-alt="${esc(`Foto ${i + 1} de ${fotos.length} — ${c.nome}`)}" aria-label="Ver foto ${i + 1}" aria-current="${i === 0}"><img src="${esc(fotoSrc(f))}" alt="" loading="lazy" width="96" height="64"></a>`).join('')}</div>` : ''}
</section>`
    : `<section class="secao galeria vazia" aria-label="Fotos"><div class="gal-stage gal-vazia"><span class="gal-vazia-pin" aria-hidden="true">${svgPin(190, '#F0030C', '#1B1B1F')}</span><div class="gal-vazia-txt"><b>Esta casa ainda não enviou fotos.</b><span>Se você é responsável por ela, envie fotos da fachada e do ambiente (sem pessoas) para aparecerem aqui.</span><a class="btn-cta" href="${CTX.u('cadastre-sua-casa/')}">Enviar fotos</a></div></div></section>`;

  const func = agrupar(c.horarios.funcionamento);
  const atend = agrupar(c.horarios.atendimento).map((l) => linhaHtml(l, TIPOS_HOR.atendimento));

  const festas = [...c.horarios.festa].sort((a, b) => DIAS.indexOf(a.dias[0]) - DIAS.indexOf(b.dias[0]) || a.faixa.a - b.faixa.a);
  const festasHtml = festas.length
    ? `<section class="secao"><h2>Festas e noites temáticas</h2><table class="horarios"><tbody>${festas.map((g) =>
      `<tr data-dias="${g.dias.map(jsDia).join(',')}"><th scope="row">${esc(g.obs || 'Festa')}<small>${esc(labelDias(g.dias))}</small></th><td><span class="hora">${fmtFaixa(g.faixa)}</span></td></tr>`).join('')}</tbody></table></section>`
    : '';

  const valoresHtml = c.valores.length
    ? `<section class="secao"><h2>Valores</h2><ul class="valores">${c.valores.map((v) => `<li>${v.rotulo ? `<span>${esc(v.rotulo)}</span>` : '<span>Valor</span>'}<strong>${esc(v.valor)}</strong></li>`).join('')}</ul><p class="obs-suave">Valores informados pela casa. Podem mudar sem aviso, principalmente em festas e datas especiais: confirme antes de ir.</p></section>`
    : '';
  const regrasHtml = c.regras.length
    ? `<section class="secao"><h2>Regras de entrada</h2><ul class="regras">${c.regras.map((r) => `<li>${esc(r)}</li>`).join('')}</ul><p class="obs-suave">Respeite as regras da casa e o consentimento de todas as pessoas.</p></section>`
    : '';

  const paragrafos = (c.sobre || '').split(/\n+/).filter(Boolean);
  const sobre = paragrafos.length
    ? paragrafos.map((p) => `<p>${esc(p)}</p>`).join('')
    : `<p style="color:#5E5B5C">A casa ainda não enviou o texto de apresentação. Se você é responsável por ela, <a class="link" style="color:#B50009;font-weight:600" href="${CTX.u('cadastre-sua-casa/')}">envie as informações</a>.</p>`;

  const perto = ordenar(locais.filter((x) => x.id !== c.id && x.uf === c.uf && x.regiaoSlug === c.regiaoSlug)).slice(0, 3);
  const maisPerto = perto.length ? perto : ordenar(locais.filter((x) => x.id !== c.id && x.uf === c.uf)).slice(0, 3);

  const body = `
<div class="conteudo">
<nav class="migalha" aria-label="Você está em">${migalhaBase()}<a href="${CTX.u(base + '/')}">${esc(e.nome)}</a><span aria-hidden="true">›</span><a href="${CTX.u(`${base}/${c.regiaoSlug}/`)}">${esc(c.regiaoNome)}</a><span aria-hidden="true">›</span><span>${esc(c.nome)}</span></nav>
${c.exemplo ? '<div class="aviso-ex"><strong>Dados de exemplo.</strong> Esta página é fictícia e serve apenas para testar o site: nome, endereço, horários e valores não correspondem a nenhum lugar real.</div>' : ''}
<section class="ficha">
<div class="ficha-info"><span class="avatar">${c.capa ? `<img src="${esc(fotoSrc(c.capa))}" alt="">` : svgPin(46, '#F0030C', '#fff')}</span>
<div style="min-width:0;display:flex;flex-direction:column"><h1>${esc(c.nome)}</h1>
<div class="tipo">${esc(c.tipoNome)} · ${esc(c.bairro)}, ${esc(c.cidade)}/${esc(c.uf)}</div>
${c.ambiente.length ? `<div class="chips-simples" style="margin-top:10px">${c.ambiente.map((a) => `<span class="chip">${esc(a)}</span>`).join('')}</div>` : ''}
<ul class="contatos">${contatos}</ul>${selo}</div></div>
<div class="ficha-acoes">
<div class="proxbox js-proxima-box" data-horarios="${esc(c.tokens)}">${ICON.clock}<div><div class="pb-label">Horários</div><div class="pb-time">a confirmar</div></div></div>
<a class="btn" href="${mapaUrl}" target="_blank" rel="noopener">Como chegar</a>
<button type="button" class="save btn save-big" data-id="${esc(c.id)}" data-nome="${esc(c.nome)}" aria-pressed="false">${ICON.heart}<span class="save-txt">Salvar na minha lista</span></button>
<a class="btn zap" href="https://wa.me/?text=${encodeURIComponent(`${c.nome} — horários e valores: ${urlAbs}`)}" target="_blank" rel="noopener">Compartilhar no WhatsApp</a>
</div></section>
<div class="duas-col"><div class="col-main" style="gap:20px">
${galeria}
<section class="secao"><div class="secao-cab"><h2>Horários de funcionamento</h2>${seloConfirmacao(c, true)}</div>${func.length ? `<table class="horarios"><tbody>${func.map((l) => linhaHtml(l)).join('')}</tbody></table>` : '<p style="color:#5E5B5C">A casa ainda não informou os horários de funcionamento.</p>'}</section>
${festasHtml}
${valoresHtml}
${regrasHtml}
${atend.length ? `<section class="secao"><h2>Atendimento e reservas</h2><table class="horarios"><tbody>${atend.join('')}</tbody></table></section>` : ''}
<section class="secao"><h2>Sobre a casa</h2>${sobre}</section>
<section class="secao" id="mapa"><h2>Como chegar</h2><p>${esc(c.endereco || `${c.bairro}, ${c.cidade} - ${c.uf}`)}</p><div class="mapa-links"><a class="btn" href="${mapaUrl}" target="_blank" rel="noopener">Abrir no Google Maps</a><a class="btn sec" href="${wazeUrl}" target="_blank" rel="noopener">Rota no Waze</a></div></section>
<section class="nota"><div><strong>Algo desatualizado?</strong> Horários, valores e regras podem mudar. Confirme com a casa e nos ajude a manter tudo correto.</div><a class="btn" href="${esc(wa(`Quero corrigir informações de ${c.nome} (${c.bairro}) no Guia de Swing: ${urlAbs}`))}" target="_blank" rel="noopener">Informar correção</a></section>
</div>
<aside class="col-side" aria-label="Publicidade e outros lugares">${banner('lateral1')}
${maisPerto.length ? `<div class="perto"><h2>Outros lugares${perto.length ? ' perto' : ''}</h2>${maisPerto.map((p) => `<a href="${CTX.u(`local/${p.slug}/`)}"><b>${esc(p.nome)}</b><span>${esc(p.tipoNome)} · ${esc(p.bairro)}</span></a>`).join('')}</div>` : ''}
</aside></div>
${banner('rodape')}
</div>`;

  const descPadrao = `${c.tipoNome} em ${c.bairro}, ${c.cidade}/${c.uf}: horários de funcionamento, valores, regras de entrada, endereço e como chegar à ${c.nome}.`;
  const jsonld = c.exemplo ? null : {
    '@context': 'https://schema.org', '@type': 'LocalBusiness', name: c.nome, url: urlAbs,
    description: c.descricao_seo || paragrafos[0] || descPadrao,
    address: { '@type': 'PostalAddress', streetAddress: c.endereco || undefined, addressLocality: c.cidade, addressRegion: c.uf, addressCountry: 'BR' },
    telephone: c.telefone || undefined
  };
  emitir(`local/${c.slug}/index.html`, layout({
    title: `${c.nome} — ${c.tipoNome} em ${c.bairro}, ${c.cidade}`,
    desc: c.descricao_seo || descPadrao, keywords: c.palavras_chave,
    canonical: `/local/${c.slug}/`, body, uf: c.uf, jsonld, noindex: c.exemplo
  }), `/local/${c.slug}/`, !c.exemplo);
}

/* ---------- Páginas de texto ---------- */
function paginaTexto(rel, titulo, desc, conteudo, canonical) {
  CTX = mkctx(1);
  const body = `<div class="conteudo"><nav class="migalha" aria-label="Você está em">${migalhaBase()}<span>${esc(titulo)}</span></nav><article class="texto"><h1 class="titulo">${esc(titulo)}</h1>${conteudo()}</article>${banner('rodape')}</div>`;
  emitir(rel, layout({ title: titulo, desc, canonical, body }), canonical, true);
}

function paginasTexto() {
  paginaTexto('anuncie/index.html', `Anuncie no ${cfg.nome}`, 'Espaços de publicidade para quem quer falar com o público adulto que procura casas e baladas liberais.', () => `
<p>O ${esc(cfg.nome)} reúne pessoas que procuram casas de swing, baladas liberais e clubes na sua região. Anunciar aqui é falar com um público adulto, local e com intenção de sair.</p>
<h2>Espaços disponíveis</h2>
<table><thead><tr><th>Espaço</th><th>Onde aparece</th><th>Tamanho</th></tr></thead><tbody>
<tr><td>Topo</td><td>Faixa larga no alto das páginas de região e de tipo</td><td>${esc(banners.topo.tamanho)} px</td></tr>
<tr><td>Lateral</td><td>Ao lado da lista e da página de cada lugar</td><td>${esc(banners.lateral1.tamanho)} px</td></tr>
<tr><td>Rodapé</td><td>Antes do rodapé, em todas as páginas</td><td>${esc(banners.rodape.tamanho)} px</td></tr>
<tr><td>Casa em destaque</td><td>Destaques no topo da lista da região</td><td>Para casas, baladas e clubes</td></tr>
</tbody></table>
<h2>Como funciona</h2>
<ol><li>Você escolhe o espaço e a região (estado ou zona).</li><li>Envia a imagem no tamanho indicado e o link de destino.</li><li>Publicamos e você acompanha o período combinado.</li></ol>
<h2>Regras para os anúncios</h2>
<p>O site é para maiores de 18 anos, mas não aceitamos imagens explícitas, nudez ou conteúdo que exponha pessoas sem autorização. Anúncios que não seguirem essa regra serão recusados.</p>
<p>Estamos em fase de testes: os primeiros anunciantes têm condições especiais. Fale conosco para conhecer os valores.</p>
<p><a class="btn" style="display:inline-block" href="${esc(wa('Olá! Quero anunciar no Guia de Swing.'))}" target="_blank" rel="noopener">Falar pelo WhatsApp</a></p>`, '/anuncie/');

  const destinoCadastro = cfg.formularioCadastro
    ? `<a class="btn" style="display:inline-block" href="${esc(cfg.formularioCadastro)}" target="_blank" rel="noopener">Preencher o formulário</a>`
    : `<a class="btn" style="display:inline-block" href="${esc(wa('Olá! Quero cadastrar a minha casa no Guia de Swing.'))}" target="_blank" rel="noopener">Cadastrar pelo WhatsApp</a>`;
  paginaTexto('cadastre-sua-casa/index.html', 'Cadastre sua casa', 'Cadastro gratuito de casas de swing, baladas liberais e clubes no Guia de Swing.', () => `
<p>O cadastro é gratuito. Quanto mais completas as informações, mais fácil é para as pessoas encontrarem a sua casa.</p>
<h2>O que vamos pedir</h2>
<ul><li>Nome, tipo de lugar (casa de swing, balada, clube...) e endereço completo</li><li>Dias e horários de funcionamento, e festas ou noites temáticas</li><li>Valores e regras de entrada (casais, solteiros, dress code, reservas)</li><li>WhatsApp, Instagram e site para contato</li><li>Fotos da fachada e do ambiente vazio, e um texto de apresentação (opcionais)</li></ul>
<h2>Importante</h2>
<ul><li>O pedido deve ser feito por quem é responsável pela casa. Ao cadastrar, você autoriza a divulgação das informações enviadas.</li><li><strong>Não publicamos fotos de pessoas</strong> nem imagens explícitas. Só fachada e ambiente.</li><li>Não divulgamos dados pessoais de frequentadores.</li></ul>
<h2>Como funciona</h2>
<ol><li>Você envia as informações.</li><li>Nossa equipe confere e publica a página da sua casa.</li><li>Para corrigir ou atualizar, basta nos avisar. Cada página mostra a data da última confirmação.</li></ol>
<p>${destinoCadastro}</p>`, '/cadastre-sua-casa/');

  paginaTexto('sobre/index.html', 'Sobre o projeto', `Conheça o ${cfg.nome}, um guia independente de casas de swing, baladas liberais e clubes do Brasil.`, () => `
<p>O <strong>${esc(cfg.nome)}</strong> é um guia independente que ajuda adultos a encontrar casas de swing, baladas liberais, clubes e outros ambientes do meio liberal, com horários, valores e regras de entrada em um só lugar.</p>
<h2>Nosso cuidado</h2>
<ul><li>Conteúdo <strong>exclusivo para maiores de 18 anos</strong>.</li><li>Sem imagens explícitas e sem fotos de pessoas.</li><li>As casas são listadas com a autorização dos responsáveis.</li><li>Cada página mostra a data da última confirmação das informações.</li></ul>
<h2>Antes de ir</h2>
<ul><li>Horários, valores e regras podem mudar em festas e datas especiais: confirme com a casa.</li><li>Leve documento com foto e respeite as regras do local.</li><li>Consentimento vem sempre em primeiro lugar. Um "não" é um "não".</li></ul>
<p>Encontrou algo errado? Use o botão "Informar correção" na página do lugar.</p>`, '/sobre/');

  paginaTexto('privacidade/index.html', 'Privacidade', `Como o ${cfg.nome} trata os seus dados.`, () => `
<p><em>Texto provisório, a ser revisado antes do lançamento oficial.</em></p>
<h2>O que coletamos</h2>
<p>Não pedimos cadastro nem login. A sua lista de lugares favoritos e a confirmação de que você é maior de 18 anos ficam salvas apenas no seu aparelho (armazenamento local do navegador) e não são enviadas para nós.</p>
<h2>Fontes e serviços externos</h2>
<p>As fontes de letra são carregadas dos servidores do Google. Ao abrir mapas ou rotas, você é levado ao Google Maps ou ao Waze, que têm suas próprias políticas de privacidade.</p>
<h2>Estatísticas de acesso</h2>
<p>Se passarmos a usar ferramentas de estatística ou publicidade com cookies, avisaremos aqui e pediremos o seu consentimento.</p>
<h2>Dados de quem cadastra uma casa</h2>
<p>Usamos as informações enviadas apenas para publicar a página da casa. Você pode pedir a correção ou a remoção a qualquer momento.</p>
<h2>Contato</h2>
<p>Dúvidas ou pedidos sobre dados: <a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>.</p>`, '/privacidade/');

  CTX = mkctx(1);
  emitir('minha-lista/index.html', layout({
    title: 'Minha lista', desc: 'Os lugares que você salvou neste aparelho.', noindex: true,
    body: `<div class="conteudo"><nav class="migalha" aria-label="Você está em">${migalhaBase()}<span>Minha lista</span></nav><h1 class="titulo">Minha lista</h1><p style="margin:0;color:#5E5B5C">Os lugares que você salvou ficam guardados neste aparelho, sem precisar de login.</p><div id="minha-lista" aria-live="polite"></div></div>`
  }), '/minha-lista/', false);
}

function pagina404() {
  CTX = mkctx(0, (cfg.basePath || '') + '/');
  emitir('404.html', layout({
    title: 'Página não encontrada', noindex: true,
    body: `<div class="conteudo"><div class="vazio-msg"><h1 class="titulo">Página não encontrada</h1><p>O endereço que você abriu não existe ou foi movido.</p><a class="btn" href="${CTX.u('')}">Voltar ao início</a></div></div>`
  }), null, false);
}

/* =====================================================================
   4. Gerar tudo
   ===================================================================== */
paginaEntrada();
paginasListagem();
for (const c of locais) paginaLocal(c);
paginasTexto();
pagina404();

fs.rmSync(OUT, { recursive: true, force: true });
const gravar = (rel, conteudo) => {
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, conteudo);
};
for (const p of paginas) gravar(p.rel, p.html);
fs.cpSync(path.join(ROOT, 'assets'), path.join(OUT, 'assets'), { recursive: true });

// Dados para busca e "Minha lista" (carregados só quando necessário)
const dadosJs = locais.map((c) => ({
  id: c.id, slug: c.slug, nome: c.nome, tipo: c.tipoNome, bairro: c.bairro, cidade: c.cidade, uf: c.uf,
  regiao: c.regiaoNome, kw: c.palavras_chave || '', horarios: c.tokens
}));
gravar('data/locais.js', `window.GDS_DATA=${JSON.stringify(dadosJs)};\n`);

// robots.txt e sitemap.xml
const indexaveis = paginas.filter((p) => p.indexar && p.url);
gravar('robots.txt', cfg.lancado
  ? `User-agent: *\nAllow: /\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`
  : 'User-agent: *\nDisallow: /\n');
gravar('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
  (cfg.lancado ? indexaveis : []).map((p) => `  <url><loc>${esc(cfg.siteUrl + p.url)}</loc></url>`).join('\n')
}\n</urlset>\n`);
if (!PREVIEW && cfg.usarDominioProprio) gravar('CNAME', cfg.dominio + '\n');
gravar('.nojekyll', '');

/* Resumo */
console.log(`\n${cfg.nome} — site gerado em ${path.relative(process.cwd(), OUT) || '.'}/`);
console.log(`  ${plural(locais.length, 'lugar', 'lugares')} · ${paginas.length} páginas${PREVIEW ? ' · modo preview (abre direto no computador)' : ''}`);
console.log(`  Fonte: ${arqPlanilha} · ${despublicados} linhas sem "publicar = SIM" ficaram de fora.`);
if (!cfg.lancado) console.log('  Aviso: "lancado" está false em dados/config.json — o Google NÃO vai indexar o site (bom para testes).');
if (avisos.length) {
  console.log(`\n  ${plural(avisos.length, 'aviso', 'avisos')} nos dados:`);
  for (const a of avisos) console.log(`   - ${a}`);
} else console.log('  Nenhum aviso nos dados.');
console.log('');
