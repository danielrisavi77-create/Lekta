import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildMentorTasks, mentorTasksHtml, mountMentorTasks, readCommentParts, suggestLinks } from '../src/ui/results/mentor-tasks';

/**
 * T13: mentorovi komentari kao lokalni zadaci, nad STVARNIM paketom (`synthetic-mentor-komentari.docx`, generiran
 * skriptom iz FPZG fixture: dva klasicna komentara + jedna nit (komentar i odgovor)).
 *
 * Tvrdnje iz plana: puni tekst komentara (ne XML isjecak), sidro ili `null` bez izmisljanja, sadrzajni komentar smije
 * biti "obradjen" ali ostaje `not-verified`, `formal-check-passed` daje samo povezana provjera koja prolazi, nepodrzana
 * struktura je oznacena.
 */
const FIXTURE = join(__dirname, 'fixtures', 'docx', 'synthetic-mentor-komentari.docx');
const bytes = new Uint8Array(readFileSync(FIXTURE));
const CHECKS = [
  { id: 'format.spacing.body', title: 'Prored osnovnog teksta', status: 'fail', earned: 0, max: 5 },
  { id: 'page.margins', title: 'Margine dokumenta', status: 'pass', earned: 3, max: 3 },
];

describe('zadaci iz komentara', () => {
  it('cita pune tekstove komentara iz paketa, s autorom; odgovor u niti je oznacen kao nepodrzan', async () => {
    const parts = await readCommentParts(bytes);
    expect(parts, 'fixture mora imati komentare').not.toBeNull();
    const tasks = buildMentorTasks({ ...parts!, checks: CHECKS });
    expect(tasks.length).toBe(4);
    const [formalni, sadrzajni, roditelj, odgovor] = tasks;
    expect(formalni.text).toBe('Prored osnovnog teksta mora biti 1,5; ovdje je jednostruki.');
    expect(formalni.authorLabel).toBe('Mentor');
    expect(formalni.anchorKey, 'komentar sa sidrom u dokumentu ima kljuc').not.toBeNull();
    expect(sadrzajni.text).toMatch(/nije potkrijepljen izvorom/);
    // Nit (roditelj + odgovor) je nepodrzana struktura: oznacena, ne tumacena. Obicni komentari nisu.
    expect(roditelj.unsupported).toBe(true);
    expect(odgovor.unsupported).toBe(true);
    expect(formalni.unsupported).toBe(false);
    expect(sadrzajni.unsupported).toBe(false);
    for (const t of tasks) {
      expect(t.userStatus).toBe('open');
      expect(t.verification).toBe('not-verified');
    }
  });

  it('prijedlog veze dolazi iz rijeci naslova provjere; sadrzajni komentar nema prijedlog', async () => {
    const parts = (await readCommentParts(bytes))!;
    const tasks = buildMentorTasks({ ...parts, checks: CHECKS });
    expect(tasks[0].suggestions.map((s) => s.id)).toEqual(['format.spacing.body']);
    expect(tasks[1].suggestions).toEqual([]);
    expect(suggestLinks(tasks[1], CHECKS)).toEqual([]);
  });

  it('dokument bez komentara vraca null, ne prazan popis s tvrdnjama', async () => {
    const bez = new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'docx', 'lo-fpzg-zavrsni-neuskladjen.docx')));
    expect(await readCommentParts(bez)).toBeNull();
  });

  it('prikaz razlikuje korisnikov status od strojne provjere', async () => {
    const parts = (await readCommentParts(bytes))!;
    const tasks = buildMentorTasks({ ...parts, checks: CHECKS });
    const html = mentorTasksHtml(tasks, (id) => CHECKS.find((c) => c.id === id)?.title ?? id);
    expect(html).toContain('Komentari mentora u dokumentu (4)');
    expect(html).toContain('data-user-status="open"');
    expect(html).toContain('Nije strojno provjereno');
    expect(html).toContain('Odgovor u niti komentara');
    expect(html).not.toContain('<w:');
  });
});

describe('montaza: obradjeno naspram provjereno', () => {
  let mount: HTMLElement;
  beforeEach(() => { document.body.innerHTML = '<section id="m" class="hidden"></section>'; mount = document.getElementById('m')!; });

  it('sadrzajni komentar oznacen obradjenim OSTAJE not-verified; formalni povezan s provjerom koja pada nije verified', async () => {
    expect(await mountMentorTasks(mount, bytes, CHECKS)).toBe(true);
    expect(mount.classList.contains('hidden')).toBe(false);
    const sadrzajni = mount.querySelectorAll<HTMLElement>('[data-mentor-task]')[1];
    sadrzajni.querySelector<HTMLButtonElement>('[data-mentor-address]')!.click();
    const nakon = mount.querySelectorAll<HTMLElement>('[data-mentor-task]')[1];
    expect(nakon.dataset.userStatus).toBe('addressed');
    expect(nakon.dataset.verification).toBe('not-verified');
    expect(nakon.textContent).toContain('sadržajnu primjedbu može potvrditi samo mentor');
    // Formalni: povezi s proredom, koji u ovim provjerama PADA -> i dalje nije verified.
    const formalni = mount.querySelectorAll<HTMLElement>('[data-mentor-task]')[0];
    formalni.querySelector<HTMLButtonElement>('[data-mentor-link][data-check-id="format.spacing.body"]')!.click();
    const f2 = mount.querySelectorAll<HTMLElement>('[data-mentor-task]')[0];
    expect(f2.dataset.verification).toBe('not-verified');
    expect(f2.textContent).toContain('još ne prolazi');
  });

  it('formalni komentar povezan s provjerom koja PROLAZI dobiva formal-check-passed', async () => {
    const prolazi = [{ ...CHECKS[0], status: 'pass', earned: 5, max: 5 }, CHECKS[1]];
    await mountMentorTasks(mount, bytes, prolazi);
    mount.querySelector<HTMLButtonElement>('[data-mentor-link][data-check-id="format.spacing.body"]')!.click();
    const f = mount.querySelectorAll<HTMLElement>('[data-mentor-task]')[0];
    expect(f.dataset.verification).toBe('formal-check-passed');
    expect(f.textContent).toContain('Povezana formalna provjera prolazi');
  });

  it('bez komentara mount ostaje skriven', async () => {
    const bez = new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'docx', 'lo-fpzg-zavrsni-neuskladjen.docx')));
    expect(await mountMentorTasks(mount, bez, CHECKS)).toBe(false);
    expect(mount.classList.contains('hidden')).toBe(true);
  });
});
