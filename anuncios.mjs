// Anúncios por página: um arquivo por anunciante em dados/anuncios/<id>.json
import fs from 'node:fs';
import path from 'node:path';
import { decodificarImagem } from './casas.mjs';

export const ESPACOS = ['topo', 'lateral1', 'lateral2', 'rodape1', 'rodape2', 'rodape3'];
export const TAM_ESPACO = {
  topo: '1375 × 280', lateral1: '420 × 551', lateral2: '420 × 551',
  rodape1: '436 × 326', rodape2: '436 × 326', rodape3: '436 × 326'
};
const s = (v) => String(v ?? '').trim();
const slug = (t) => s(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function hojeSP(agora = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
  return p; // AAAA-MM-DD
}

export function lerAnuncios(dir, warn, hoje = hojeSP()) {
  const ads = [], imagens = [];
  if (!fs.existsSync(dir)) return { ads, imagens };
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_')).sort()) {
    let j;
    try { j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { warn(`dados/anuncios/${f}: arquivo inválido (${e.message}).`); continue; }
    const id = slug(j.id || f.replace(/\.json$/, ''));
    if (!id) { warn(`dados/anuncios/${f}: sem "id".`); continue; }
    if (j.ativo === false) continue;
    const inicio = s(j.inicio), fim = s(j.fim);
    if (inicio && hoje < inicio) continue; // ainda não começou
    if (fim && hoje > fim) continue; // já terminou
    const link = s(j.link);
    if (!/^https?:\/\//i.test(link)) warn(`Anúncio "${id}": o link precisa começar com https:// (está "${link}").`);
    const espacos = {};
    for (const [pos, v] of Object.entries(j.espacos || {})) {
      if (!ESPACOS.includes(pos) || !v) continue;
      if (String(v).startsWith('data:')) {
        const img = decodificarImagem(v, 1500 * 1024);
        if (!img) { warn(`Anúncio "${id}": a imagem de "${pos}" é inválida ou grande demais — ignorada.`); continue; }
        const rel = `assets/anuncios/${id}/${pos}.${img.ext}`;
        imagens.push({ rel, buf: img.buf }); espacos[pos] = rel;
      } else espacos[pos] = s(v);
    }
    const paginas = (Array.isArray(j.paginas) ? j.paginas : []).map((a) => ({
      tipo: s(a.tipo), uf: s(a.uf).toUpperCase(), regiao: slug(a.regiao), categoria: slug(a.categoria), id: s(a.id), filhas: !!a.filhas
    })).filter((a) => ['site', 'estado', 'regiao', 'categoria', 'casa'].includes(a.tipo));
    if (!paginas.length) { warn(`Anúncio "${id}": nenhuma página marcada — não aparece em lugar nenhum.`); continue; }
    if (!Object.keys(espacos).length) { warn(`Anúncio "${id}": nenhuma imagem — ignorado.`); continue; }
    ads.push({ id, anunciante: s(j.anunciante) || id, link, campanha: s(j.campanha) || id, alt: s(j.alt) || s(j.anunciante) || 'Publicidade', inicio, paginas, espacos });
  }
  return { ads, imagens };
}

/* Quanto o alvo combina com a página (0 = não combina). Página marcada diretamente vale 10; "páginas de dentro" valem menos. */
export function pontuar(a, pag) {
  const dentro = pag.kind === 'regiao' || pag.kind === 'tipo' || pag.kind === 'casa';
  switch (a.tipo) {
    case 'site': return 1;
    case 'estado':
      if (pag.kind === 'estado' && pag.uf === a.uf) return 10;
      return a.filhas && dentro && pag.uf === a.uf ? 3 : 0;
    case 'regiao':
      if (pag.kind === 'regiao' && pag.uf === a.uf && pag.regiaoSlug === a.regiao) return 10;
      return a.filhas && pag.kind === 'casa' && pag.uf === a.uf && pag.regiaoSlug === a.regiao ? 4 : 0;
    case 'categoria':
      if (pag.kind === 'tipo' && pag.uf === a.uf && pag.tipoSlug === a.categoria) return 10;
      return a.filhas && pag.kind === 'casa' && pag.uf === a.uf && pag.tipoSlug === a.categoria ? 4 : 0;
    case 'casa': return pag.kind === 'casa' && pag.casaId === a.id ? 10 : 0;
    default: return 0;
  }
}

/* Exclusivo: um anunciante por espaço e página. Vence quem marcou a página mais de perto;
   empate: começou antes; depois: ordem alfabética do id. */
export function escolher(ads, pag, pos, aoEmpatar = () => {}) {
  const cand = [];
  for (const ad of ads) {
    if (!ad.espacos[pos]) continue;
    const pts = Math.max(0, ...ad.paginas.map((a) => pontuar(a, pag)));
    if (pts > 0) cand.push({ ad, pts });
  }
  if (!cand.length) return null;
  cand.sort((x, y) => y.pts - x.pts || (x.ad.inicio || '').localeCompare(y.ad.inicio || '') || x.ad.id.localeCompare(y.ad.id));
  const topo = cand.filter((c) => c.pts === cand[0].pts);
  if (topo.length > 1) aoEmpatar(`Conflito no espaço "${pos}": ${topo.map((c) => c.ad.id).join(' e ')} disputam as mesmas páginas; aparece "${topo[0].ad.id}" (começou antes ou vem primeiro em ordem alfabética).`);
  return { ad: cand[0].ad, img: cand[0].ad.espacos[pos] };
}
