import assert from 'node:assert/strict';
import { parseDias, labelDias, parseFaixa, fmtFaixa, parseCSV, slugify, parseLista, parsePares, fmtDataCurta, idadeDias } from '../build/lib.mjs';
await import('../assets/app.js');
const { estado, parseHorarios, rotulo, agoraSP } = globalThis.GDS_LOGICA;

// --- dias ---
assert.deepEqual(parseDias('seg-sex'), ['seg','ter','qua','qui','sex']);
assert.deepEqual(parseDias('sáb'), ['sab']);
assert.deepEqual(parseDias('sex-sab'), ['sex','sab']);
assert.deepEqual(parseDias('qua e sex'), ['qua','sex']);
assert.equal(parseDias('todos').length, 7);
assert.deepEqual(parseDias('xyz'), []);
assert.equal(labelDias(parseDias('sex-sab')), 'Sexta e sábado');
assert.equal(labelDias(parseDias('dom')), 'Domingo');
assert.equal(labelDias(parseDias('ter-sex')), 'Terça a sexta');
// --- horas ---
assert.equal(fmtFaixa(parseFaixa('22:00')), '22h');
assert.equal(fmtFaixa(parseFaixa('22:00-05:00')), '22h às 05h');
assert.equal(fmtFaixa(parseFaixa('23h30-4h')), '23h30 às 04h');
assert.equal(parseFaixa('25:00'), null);
assert.equal(parseFaixa('abc'), null);
// --- csv, textos ---
const csv = parseCSV('id;nome;obs\n1;"Casa, Um";"disse ""oi"""\n2;Dois;\n');
assert.equal(csv[0].nome, 'Casa, Um'); assert.equal(csv[0].obs, 'disse "oi"'); assert.equal(csv.length, 2);
assert.equal(slugify('Casa Veludo — Pinheiros'), 'casa-veludo-pinheiros');
assert.deepEqual(parseLista('a; b | c;'), ['a', 'b', 'c']);
assert.deepEqual(parsePares('Casal: R$ 200; Mulher solteira: R$ 50'), [{ rotulo: 'Casal', valor: 'R$ 200' }, { rotulo: 'Mulher solteira', valor: 'R$ 50' }]);
assert.deepEqual(parsePares('Consulte a casa'), [{ rotulo: '', valor: 'Consulte a casa' }]);
assert.equal(fmtDataCurta('2026-10-14'), '14/10'); assert.equal(fmtDataCurta('14/10/2026'), '');
assert.equal(idadeDias('2026-10-01', new Date(2026, 9, 15)), 14);
assert.equal(idadeDias('lixo'), null);

// --- "Funciona hoje" (0=dom ... 6=sab) ---
const T = (h, mi = 0) => h * 60 + mi;
const txt = (h, a) => rotulo(estado(parseHorarios(h), a)).txt;
const noite = '5@22:00-05:00 6@22:00-05:00'; // sexta e sábado, 22h às 5h

assert.equal(txt(noite, { dia: 5, min: T(21) }), 'Funciona hoje · abre às 22h');
assert.equal(rotulo(estado(parseHorarios(noite), { dia: 5, min: T(21) })).cls, 'badge-hoje');
assert.equal(txt(noite, { dia: 5, min: T(23) }), 'Aberto agora · até 05h');
// madrugada de sábado ainda é a noite de sexta
assert.equal(txt(noite, { dia: 6, min: T(2) }), 'Aberto agora · até 05h');
assert.equal(txt(noite, { dia: 6, min: T(4, 59) }), 'Aberto agora · até 05h');
// 05h em ponto já fechou: sábado 22h
assert.equal(txt(noite, { dia: 6, min: T(5) }), 'Funciona hoje · abre às 22h');
// madrugada de domingo = noite de sábado
assert.equal(txt(noite, { dia: 0, min: T(3) }), 'Aberto agora · até 05h');
// domingo de manhã: próxima é sexta
assert.equal(txt(noite, { dia: 0, min: T(6) }), 'Próxima: sex · 22h');
// quinta: amanhã
assert.equal(txt(noite, { dia: 4, min: T(12) }), 'Amanhã · 22h');
// madrugada de sexta (antes da abertura da própria sexta) não está aberto
assert.equal(txt(noite, { dia: 5, min: T(3) }), 'Funciona hoje · abre às 22h');
// horário que não cruza a meia-noite
assert.equal(txt('4@18:00-23:00', { dia: 4, min: T(19) }), 'Aberto agora · até 23h');
assert.equal(txt('4@18:00-23:00', { dia: 4, min: T(23, 30) }), 'Próxima: qui · 18h');
// só hora de abertura (sem fechamento): nunca "aberto agora"
assert.equal(txt('3@20:00-', { dia: 3, min: T(21) }), 'Próxima: qua · 20h');
assert.equal(txt('3@20:00-', { dia: 3, min: T(19) }), 'Funciona hoje · abre às 20h');
// duas aberturas no mesmo dia
assert.equal(txt('6@16:00-20:00 6@22:00-04:00', { dia: 6, min: T(21) }), 'Funciona hoje · abre às 22h');
// sem horários
assert.equal(txt('', { dia: 1, min: 0 }), 'Horários a confirmar');
// análise do texto serializado
assert.deepEqual(parseHorarios('5@22:00-05:00'), [{ d: 5, a: 1320, b: 300 }]);
assert.deepEqual(parseHorarios('3@20:00-'), [{ d: 3, a: 1200, b: null }]);

// fuso: 2026-10-14 (quarta) 23:30 UTC-3 = 02:30 UTC do dia 15 -> ainda quarta em São Paulo
const a = agoraSP(new Date('2026-10-15T02:30:00Z')); assert.deepEqual([a.dia, a.min], [3, T(23, 30)]);
const b = agoraSP(new Date('2026-10-15T03:00:00Z')); assert.deepEqual([b.dia, b.min], [4, 0]); // meia-noite = quinta 00:00
console.log('todos os testes passaram');
