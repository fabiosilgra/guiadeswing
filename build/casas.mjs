// Lê uma casa por arquivo (dados/casas/<id>.json) e converte para o mesmo formato das linhas da planilha.
import fs from 'node:fs';
import path from 'node:path';

const lista = (v) => (Array.isArray(v) ? v : String(v ?? '').split(/[;|\n]/))
  .map((x) => String(x).replace(/;/g, ',').replace(/\|/g, '/').trim()).filter(Boolean).join('; ');
const s = (v) => String(v ?? '').trim();
const pares = (arr) => (Array.isArray(arr) ? arr : []).map((o) => (o.rotulo ? `${s(o.rotulo)}: ${s(o.valor)}` : s(o.valor))).filter(Boolean).join('; ');

export function lerCasas(dir, warn) {
  const L = [], H = [], V = [];
  if (!fs.existsSync(dir)) return { L, H, V, arquivos: 0 };
  const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort();
  for (const f of arquivos) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { warn(`dados/casas/${f}: arquivo inválido (${e.message}). Gere de novo pelo formulário.`); continue; }
    const id = s(j.id);
    if (!id) { warn(`dados/casas/${f}: sem "id" — ignorado.`); continue; }
    const row = { publicar: j.publicar === false ? 'NÃO' : 'SIM', autorizado: j.autorizado === false ? 'NÃO' : 'SIM', exemplo: j.exemplo ? 'SIM' : '' };
    for (const k of ['id', 'nome', 'tipo', 'uf', 'cidade', 'bairro', 'regiao', 'endereco', 'logo', 'sobre', 'descricao_seo', 'palavras_chave', 'whatsapp', 'telefone', 'email', 'site', 'instagram', 'confirmado_em']) row[k] = s(j[k]);
    row.ambiente = lista(j.ambiente); row.regras = lista(j.regras); row.fotos = lista(j.fotos);
    L.push(row);
    for (const h of j.horarios || []) H.push({ id_local: id, tipo: s(h.tipo) || 'funcionamento', dias: s(h.dias), hora: s(h.hora), obs: s(h.obs) });
    for (const v of j.valores || []) V.push({ id_local: id, dia: s(v.dia), condicao: s(v.condicao), casal: s(v.casal), mulher_solteira: s(v.mulher_solteira), homem_solteiro: s(v.homem_solteiro), outros: pares(v.outros), obs: s(v.obs) });
  }
  return { L, H, V, arquivos: arquivos.length };
}

/* ---------- HTML seguro para o texto "sobre" ---------- */
const PERMITIDAS = new Set(['h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'a', 'br', 'blockquote']);
const SEM_FECHAR = new Set(['br']);
const escAttr = (t) => t.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export const ehHtml = (t) => /<\/?[a-z][a-z0-9]*[\s>/]/i.test(String(t || ''));

export function sanitizarHtml(entrada, warn = () => {}) {
  let html = String(entrada || '').replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|form|svg|noscript)\b[\s\S]*?<\/\1\s*>/gi, '');
  let saida = '';
  const pilha = [];
  let removidas = new Set();
  let pos = 0;
  const re = /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi;
  let m;
  const texto = (t) => t.replace(/<(?![^>]*>)/g, '&lt;');
  while ((m = re.exec(html))) {
    saida += texto(html.slice(pos, m.index));
    pos = re.lastIndex;
    const fecha = m[1] === '/';
    let tag = m[2].toLowerCase();
    if (tag === 'h1') tag = 'h2'; // o h1 da página é o nome da casa
    if (tag === 'h5' || tag === 'h6') tag = 'h4';
    if (tag === 'div' || tag === 'span' || tag === 'section' || tag === 'article') { removidas.add(tag); continue; }
    if (!PERMITIDAS.has(tag)) { removidas.add(tag); continue; }
    if (fecha) {
      const i = pilha.lastIndexOf(tag);
      if (i === -1) continue;
      while (pilha.length > i) saida += `</${pilha.pop()}>`;
      continue;
    }
    if (tag === 'a') {
      const h = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[3]);
      const url = (h ? (h[2] ?? h[3] ?? h[4]) : '').trim();
      if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(url)) {
        saida += `<a href="${escAttr(url)}" rel="noopener nofollow ugc"${/^https?:/i.test(url) ? ' target="_blank"' : ''}>`;
        pilha.push('a');
      } else { removidas.add('a (link inválido)'); }
      continue;
    }
    if (SEM_FECHAR.has(tag)) { saida += `<${tag}>`; continue; }
    saida += `<${tag}>`; pilha.push(tag);
  }
  saida += texto(html.slice(pos));
  while (pilha.length) saida += `</${pilha.pop()}>`;
  if (removidas.size) warn(`texto "sobre": removi marcações não permitidas (${[...removidas].join(', ')}).`);
  return saida.trim();
}

export const textoPuro = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
