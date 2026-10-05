import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCTION_CONFIG, productionStatus, paidOffersLive,
  reportEndpointConfigured, checkoutConfigured, loadProductionConfig, migrateContactEmail,
} from '../src/config/production-config';
import { STORAGE_KEYS } from '../src/shared/browser-storage';

/**
 * PRODUKCIJSKA KONFIGURACIJA odgovara na jedno pitanje: je li placena ponuda ZIVA.
 *
 * O tome ovisi prikazuje li cjenik gumbe ili oznaku "uskoro". Kriv odgovor u JEDNOM smjeru je
 * ozbiljan: ponuditi naplatu koja ne radi. Drugi smjer (sakriti ponudu koja radi) je steta, ali
 * ne i obecanje koje se ne moze ispuniti, pa se mjere odvojeno.
 *
 * Funkcije PRIMAJU konfiguraciju, ne citaju modulsku promjenjivu. `app.ts` svoju mijenja tri puta
 * u izvodjenju, pa bi dijeljeno stanje znacilo da jedna strana vidi staru vrijednost.
 */

const prazna = { ...DEFAULT_PRODUCTION_CONFIG, reportEndpoint: '', checkoutEndpoint: '', enabled: false, orderEndpoint: '' };

describe('je li placena ponuda ziva', () => {
  it('zadana konfiguracija NE nudi naplatu', () => {
    // Najvaznija tvrdnja: bez izricite konfiguracije ponuda mora biti mrtva. Obrnuto bi znacilo
    // da svjez deploy nudi placanje koje nitko nije ukljucio.
    expect(paidOffersLive(prazna)).toBe(false);
  });

  it('svaki od tri puta ZASEBNO ozivljava ponudu', () => {
    expect(paidOffersLive({ ...prazna, reportEndpoint: 'https://a' })).toBe(true);
    expect(paidOffersLive({ ...prazna, checkoutEndpoint: 'https://b' })).toBe(true);
    expect(paidOffersLive({ ...prazna, enabled: true, orderEndpoint: '/x' })).toBe(true);
  });

  it('sam `enabled` bez odredista NIJE ziva ponuda', () => {
    // Ukljucena zastavica bez endpointa je polovicna konfiguracija; narudzba ne bi imala kamo.
    expect(productionStatus({ ...prazna, enabled: true }).active).toBe(false);
    expect(paidOffersLive({ ...prazna, enabled: true })).toBe(false);
  });

  it('prazan niz i sami razmaci se ne racunaju kao odrediste', () => {
    expect(reportEndpointConfigured({ ...prazna, reportEndpoint: '   ' })).toBe(false);
    expect(checkoutConfigured({ ...prazna, checkoutEndpoint: '\t' })).toBe(false);
  });

  it('nedostajuca konfiguracija ne rusi nego se cita kao mrtva', () => {
    for (const bad of [null, undefined, {}]) {
      expect(paidOffersLive(bad), String(bad)).toBe(false);
    }
  });

  it('broji se koliko je platnih poveznica ISPUNJENO, ne koliko ih ima', () => {
    expect(productionStatus({ ...prazna, paymentLinks: { format: 'https://a', panic: '', premium: '' } }).links).toBe(1);
  });
});

describe('kontakt adresa iz spremljene konfiguracije (T49, Codex nalaz 5 na #273)', () => {
  it('tocno stara zadana adresa prelazi na novu zadanu', () => {
    expect(migrateContactEmail('lekta.kontakt@gmail.com')).toBe(DEFAULT_PRODUCTION_CONFIG.contactEmail);
    expect(migrateContactEmail(' lekta.kontakt@gmail.com ')).toBe(DEFAULT_PRODUCTION_CONFIG.contactEmail);
    expect(migrateContactEmail(undefined)).toBe(DEFAULT_PRODUCTION_CONFIG.contactEmail);
    expect(migrateContactEmail('')).toBe(DEFAULT_PRODUCTION_CONFIG.contactEmail);
  });

  it('svjesno spremljena druga adresa ostaje', () => {
    expect(migrateContactEmail('ured@primjer.hr')).toBe('ured@primjer.hr');
  });

  it('loadProductionConfig nad spremljenom starom konfiguracijom vraca novu adresu', () => {
    localStorage.setItem(STORAGE_KEYS.production, JSON.stringify({ contactEmail: 'lekta.kontakt@gmail.com', businessName: 'Lekta' }));
    try {
      expect(loadProductionConfig().contactEmail).toBe('support@lekta.hr');
      localStorage.setItem(STORAGE_KEYS.production, JSON.stringify({ contactEmail: 'ured@primjer.hr' }));
      expect(loadProductionConfig().contactEmail).toBe('ured@primjer.hr');
    } finally {
      localStorage.removeItem(STORAGE_KEYS.production);
    }
  });
});