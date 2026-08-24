/**
 * Gard nad citanjem sposobnosti IZ ISPORUCENOG paketa (scripts/deploy-gate-shipped-config.mjs).
 *
 * Zasto sintetickim ulazima, a ne nad pravim dist: pravi bundle danas ima naplatu UGASENU, pa bi
 * se nad njim mogao dokazati samo negativan smjer. Kvar koji ovaj gard treba uhvatiti je onaj u
 * kojem naplata OZIVI dok pravni subjekt nije registriran, a takav bundle na disku ne postoji.
 * Zato se detektor hrani nizovima koji doslovno reproduciraju oblike iz minifikata.
 *
 * Oblici su prepisani iz stvarnog builda (dist/assets/index-*.js), ne izmisljeni:
 *   ugaseno   `checkoutEndpoint:``,guaranteeEndpoint:``,`
 *   zivo      `repairEndpoint:he.functionEndpoint(`repair-docx`),`
 *   spread    `paymentLinks:{...Jd.paymentLinks,...e?.paymentLinks||{}}}`
 */
import { describe, it, expect } from 'vitest';
import {
  shippedEndpoint,
  shippedPaymentLink,
  shippedCapabilities,
} from '../scripts/deploy-gate-shipped-config.mjs';

const OFF = 'reportEndpoint:``,repairEndpoint:``,checkoutEndpoint:``,guaranteeEndpoint:``,';
const REPAIR_ON =
  'reportEndpoint:``,repairEndpoint:he.functionEndpoint(`repair-docx`),checkoutEndpoint:``,';
const CHECKOUT_ON =
  'repairEndpoint:he.functionEndpoint(`repair-docx`),checkoutEndpoint:`https://pay.example/x`,';
const LINKS_OFF = 'paymentLinks:{format:``,panic:``,premium:``},businessName:`Lekta`,';
const LINKS_ON = 'paymentLinks:{format:`https://lemon.example/a`,panic:``,premium:``},';
const LINKS_SPREAD = 'paymentLinks:{...Jd.paymentLinks,...e?.paymentLinks||{}}}';

describe('sposobnosti se citaju iz isporucenog paketa', () => {
  it('prazan literal je UGASEN endpoint, poziv funkcije je ZIV', () => {
    expect(shippedEndpoint(OFF, 'repairEndpoint')).toBe(false);
    expect(shippedEndpoint(REPAIR_ON, 'repairEndpoint')).toBe(true);
    expect(shippedEndpoint(REPAIR_ON, 'checkoutEndpoint')).toBe(false);
    expect(shippedEndpoint(CHECKOUT_ON, 'checkoutEndpoint')).toBe(true);
  });

  it('endpoint kojeg u paketu uopce nema NIJE ziv', () => {
    expect(shippedEndpoint('nekiDrugiKod:1', 'checkoutEndpoint')).toBe(false);
  });

  it('payment link je ziv samo kad je vrijednost neprazna', () => {
    expect(shippedPaymentLink(LINKS_OFF)).toBe(false);
    expect(shippedPaymentLink(LINKS_ON)).toBe(true);
  });

  it('spread oblik paymentLinks se NE broji kao ponudjeno placanje', () => {
    // Bez ovoga bi svaki build izgledao kao da naplata radi, jer se taj oblik uvijek emitira.
    expect(shippedPaymentLink(LINKS_SPREAD)).toBe(false);
    expect(shippedPaymentLink(LINKS_OFF + LINKS_SPREAD)).toBe(false);
  });

  it('danasnje stanje: popravak ZIV, naplata UGASENA', () => {
    const caps = shippedCapabilities([REPAIR_ON + LINKS_OFF + LINKS_SPREAD]);
    expect(caps.repair).toBe(true);
    expect(caps.commerce).toBe(false);
    expect(caps.why.commerce).toBeNull();
  });

  it('naplata ozivi preko checkoutEndpointa ILI preko payment linka', () => {
    expect(shippedCapabilities([CHECKOUT_ON + LINKS_OFF]).commerce).toBe(true);
    expect(shippedCapabilities([REPAIR_ON + LINKS_ON]).commerce).toBe(true);
    // Obrazlozenje mora imenovati KOJI je od dva puta okinuo, inace se pad ne moze dijagnosticirati.
    expect(shippedCapabilities([CHECKOUT_ON]).why.commerce).toContain('checkoutEndpoint');
    expect(shippedCapabilities([REPAIR_ON + LINKS_ON]).why.commerce).toContain('payment link');
  });

  it('vise datoteka: dovoljno je da JEDNA nudi placanje', () => {
    expect(shippedCapabilities([OFF, OFF, CHECKOUT_ON]).commerce).toBe(true);
    expect(shippedCapabilities([OFF, OFF, OFF]).commerce).toBe(false);
  });
});
