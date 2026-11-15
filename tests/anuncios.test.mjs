import assert from 'node:assert/strict';
import { escolher, pontuar, hojeSP } from '../build/anuncios.mjs';

const ad = (id, paginas, espacos = { topo: `a/${id}.png` }, inicio = '') => ({ id, paginas, espacos, inicio });
const site = { tipo: 'site' }, sp = { tipo: 'estado', uf: 'SP' }, spF = { tipo: 'estado', uf: 'SP', filhas: true };
const zs = { tipo: 'regiao', uf: 'SP', regiao: 'zona-sul' }, casa = { tipo: 'casa', id: 'gds-sp-001' };
const pagSP = { kind: 'estado', uf: 'SP' }, pagZS = { kind: 'regiao', uf: 'SP', regiaoSlug: 'zona-sul' };
const pagCasa = { kind: 'casa', uf: 'SP', regiaoSlug: 'zona-sul', tipoSlug: 'balada-liberal', casaId: 'gds-sp-001' };
const pagRJ = { kind: 'estado', uf: 'RJ' };

// só aparece onde foi marcado
assert.equal(pontuar(sp, pagSP), 10);
assert.equal(pontuar(sp, pagZS), 0);
assert.equal(pontuar(sp, pagCasa), 0);
assert.equal(pontuar(sp, pagRJ), 0);
// pacote: inclui as páginas de dentro
assert.equal(pontuar(spF, pagZS), 3);
assert.equal(pontuar(spF, pagCasa), 3);
assert.equal(pontuar(spF, pagRJ), 0);
assert.equal(pontuar(casa, pagCasa), 10);
assert.equal(pontuar(casa, { ...pagCasa, casaId: 'gds-sp-002' }), 0);
assert.equal(pontuar(site, pagRJ), 1);
// nada marcado = nada
assert.equal(escolher([ad('x', [sp])], pagZS, 'topo'), null);
// espaço sem imagem
assert.equal(escolher([ad('x', [sp])], pagSP, 'lateral1'), null);
// exclusivo: a página marcada diretamente vence o site inteiro
assert.equal(escolher([ad('geral', [site]), ad('sp', [sp])], pagSP, 'topo').ad.id, 'sp');
assert.equal(escolher([ad('geral', [site]), ad('sp', [sp])], pagRJ, 'topo').ad.id, 'geral');
// direta vence "páginas de dentro"
assert.equal(escolher([ad('pacote', [spF]), ad('casa', [casa])], pagCasa, 'topo').ad.id, 'casa');
// empate: começou antes ganha e avisa
let aviso = '';
const r = escolher([ad('b', [sp], undefined, '2026-12-01'), ad('a', [sp], undefined, '2026-11-01')], pagSP, 'topo', (m) => (aviso = m));
assert.equal(r.ad.id, 'a'); assert.match(aviso, /Conflito/);
assert.match(hojeSP(new Date('2026-11-15T02:00:00Z')), /^2026-11-14$/); // ainda dia 14 em São Paulo
console.log('testes de anúncios passaram');
