import { describe, it, expect } from 'vitest';

import { formatCitation, type CitationInput, type CitationStyle } from '../src/tools/citation';

/**
 * Rucni GOLDEN za vjerne autor-datum stilove (apa/harvard/chicago-author-date) na tipovima koje
 * doi.org/CSL korpus NE pokriva pouzdano (knjiga/poglavlje - CSL im izostavlja izdavaca, ubacuje
 * datumske artefakte). Ocekivani izlazi su iz stilskih PRIRUCNIKA:
 *  - APA7: knjiga bez mjesta ("Naslov. Izdavac."); poglavlje "In Ur. (Ed.), Knjiga (pp. X). Izdavac."
 *  - Harvard (cite-them-right): "Mjesto: Izdavac"; poglavlje "in Ur. (ed.) Knjiga. Mjesto: Izdavac, pp. X."
 *  - Chicago autor-datum: puno ime; "Mjesto: Izdavac"; poglavlje "In Knjiga, edited by Ur., X. Mjesto: Izdavac."
 * Egzaktna jednakost (ovo su nasi kanonski izlazi); regresija ako se renderer promijeni.
 */
const CASES: Array<{ label: string; inp: CitationInput; expect: Record<CitationStyle & string, string> }> = [
  {
    label: 'knjiga, 2 autora',
    inp: { type: 'knjiga', authors: 'Lave, Jean; Wenger, Etienne', title: 'Situated learning', year: '1991', place: 'Cambridge', publisher: 'Cambridge University Press' },
    expect: {
      apa: 'Lave, J., & Wenger, E. (1991). Situated learning. Cambridge University Press.',
      harvard: 'Lave, J. and Wenger, E. (1991) Situated learning. Cambridge: Cambridge University Press.',
      'chicago-author-date': 'Lave, Jean, and Etienne Wenger. 1991. Situated learning. Cambridge: Cambridge University Press.',
    },
  },
  {
    label: 'knjiga, 1 autor, mjesto s drzavom',
    inp: { type: 'knjiga', authors: 'Piketty, Thomas', title: 'Capital in the twenty-first century', year: '2014', place: 'Cambridge, MA', publisher: 'Harvard University Press' },
    expect: {
      apa: 'Piketty, T. (2014). Capital in the twenty-first century. Harvard University Press.',
      harvard: 'Piketty, T. (2014) Capital in the twenty-first century. Cambridge, MA: Harvard University Press.',
      'chicago-author-date': 'Piketty, Thomas. 2014. Capital in the twenty-first century. Cambridge, MA: Harvard University Press.',
    },
  },
  {
    label: 'poglavlje u knjizi',
    inp: { type: 'poglavlje', authors: 'Smith, John', title: 'Framing effects', editor: 'A. Editor', container: 'Handbook of judgment', place: 'New York', publisher: 'Guilford Press', year: '2019', pages: '200-231' },
    expect: {
      apa: 'Smith, J. (2019). Framing effects. In A. Editor (Ed.), Handbook of judgment (pp. 200-231). Guilford Press.',
      harvard: 'Smith, J. (2019) "Framing effects," in A. Editor (ed.) Handbook of judgment. New York: Guilford Press, pp. 200-231.',
      'chicago-author-date': 'Smith, John. 2019. "Framing effects." In Handbook of judgment, edited by A. Editor, 200-231. New York: Guilford Press.',
    },
  },
  {
    label: 'clanak, 3 autora (razlika spoja: & / and / , and)',
    inp: { type: 'clanak', authors: 'Ivic, Ana; Baric, Petar; Coric, Marko', title: 'Cognitive load in learning', container: 'Learning and Instruction', volume: '58', issue: '2', pages: '120-135', year: '2020' },
    expect: {
      apa: 'Ivic, A., Baric, P., & Coric, M. (2020). Cognitive load in learning. Learning and Instruction, 58(2), 120-135.',
      harvard: 'Ivic, A., Baric, P. and Coric, M. (2020) "Cognitive load in learning," Learning and Instruction, 58(2), pp. 120-135.',
      'chicago-author-date': 'Ivic, Ana, Petar Baric, and Marko Coric. 2020. "Cognitive load in learning." Learning and Instruction 58 (2): 120-35.',
    },
  },
];

describe('render golden (rucni): apa/harvard/chicago-author-date knjiga/poglavlje/clanak', () => {
  for (const c of CASES) {
    for (const [style, want] of Object.entries(c.expect)) {
      it(`[${style}] ${c.label}`, () => {
        expect(formatCitation(c.inp, style as CitationStyle).citation).toBe(want);
      });
    }
  }
});

/**
 * ADVERSARIJALNI GOLDEN: render divergencije koje je nasao workflow w1ljuzarh (62 agenta, 2 runde,
 * skeptik-verifikacija) na teskim ulazima koje CSL-korpus clanaka ne pokriva. Svaki expect je
 * MANUAL-tocan po stilskom prirucniku (APA 7 / cite-them-right / CMOS 17), NEZAVISNO reverificiran
 * (finder-expecti nisu uzeti na vjeru: npr. Chicago 165-176 -> 165-76 elizija, koju su finderi
 * propustili). NAMJERNO ODBACENO: Harvard jednostruki navodnici oko naslova (motorov standard je
 * doi.org/CSL harvard-cite-them-right = dvostruki, validirano 264/264; knjizni CTR oblik zivi u
 * per-fakultet spec-u). Egzaktna jednakost; regresija ako renderer odstupi.
 */
const ADV_REF: Array<{ label: string; style: CitationStyle; inp: CitationInput; expect: string }> = [
  {
    label: 'APA 21+ autora: prvih 19, elipsa, zadnji (bez &)',
    style: 'apa',
    inp: { type: 'clanak', authors: 'Anderson, Alice; Baker, Bob; Clark, Carol; Davis, Dan; Evans, Eve; Foster, Frank; Green, Grace; Harris, Henry; Irwin, Iris; Jones, Jack; King, Kate; Lewis, Leo; Moore, Mary; Nelson, Nick; Owens, Olive; Perez, Paul; Quinn, Quincy; Roberts, Rose; Smith, Sam; Taylor, Tom; Turner, Uma', title: 'Velika studija', container: 'Journal of Testing', volume: '5', issue: '2', pages: '10-20', year: '2021' },
    expect: 'Anderson, A., Baker, B., Clark, C., Davis, D., Evans, E., Foster, F., Green, G., Harris, H., Irwin, I., Jones, J., King, K., Lewis, L., Moore, M., Nelson, N., Owens, O., Perez, P., Quinn, Q., Roberts, R., Smith, S., … Turner, U. (2021). Velika studija. Journal of Testing, 5(2), 10-20.',
  },
  {
    label: 'Chicago 11+ autora: prvih 7 pa et al. (+ CMOS 9.61 elizija 165-76)',
    style: 'chicago-author-date',
    inp: { type: 'clanak', authors: 'Satterfield, Susan; Adams, John; Baker, Mary; Clark, Peter; Davis, Anne; Evans, Tom; Foster, Kate; Green, Luke; Hall, Nina; Irwin, Paul; Jones, Rita', title: 'Livy and the Pax Deum', container: 'Classical Philology', volume: '111', pages: '165-176', year: '2016' },
    expect: 'Satterfield, Susan, John Adams, Mary Baker, Peter Clark, Anne Davis, Tom Evans, Kate Foster, et al. 2016. "Livy and the Pax Deum." Classical Philology 111: 165-76.',
  },
  {
    label: 'APA crtica u imenu: Jean-Baptiste -> J.-B.',
    style: 'apa',
    inp: { type: 'knjiga', authors: 'Lamarck, Jean-Baptiste', title: 'Philosophie zoologique', year: '1809', publisher: 'Dentu' },
    expect: 'Lamarck, J.-B. (1809). Philosophie zoologique. Dentu.',
  },
  {
    label: 'APA institucionalni autor (hrvatski): tocka iza autora pred godinom',
    style: 'apa',
    inp: { type: 'mrezni', authors: 'Ministarstvo znanosti i obrazovanja', title: 'Godisnje izvjesce', url: 'https://mzo.gov.hr', year: '2022' },
    expect: 'Ministarstvo znanosti i obrazovanja. (2022). Godisnje izvjesce. https://mzo.gov.hr',
  },
  {
    label: 'Harvard online clanak bez DOI-a: Available at URL (Accessed)',
    style: 'harvard',
    inp: { type: 'clanak', authors: 'Smith, John', title: 'Online first paper', container: 'Journal of Web Studies', volume: '5', issue: '2', pages: '10-20', url: 'https://example.com/article', accessed: '5 July 2026', year: '2021' },
    expect: 'Smith, J. (2021) "Online first paper," Journal of Web Studies, 5(2), pp. 10-20. Available at: https://example.com/article (Accessed: 5 July 2026).',
  },
  {
    label: 'Chicago broj bez sveska: ", no. 2" (+ elizija 405-50)',
    style: 'chicago-author-date',
    inp: { type: 'clanak', authors: 'Kossinets, Gueorgi; Watts, Duncan J.', title: 'Origins of Homophily in an Evolving Social Network', container: 'American Journal of Sociology', issue: '2', pages: '405-450', year: '2009' },
    expect: 'Kossinets, Gueorgi, and Duncan J. Watts. 2009. "Origins of Homophily in an Evolving Social Network." American Journal of Sociology, no. 2: 405-50.',
  },
  {
    label: 'APA clanak bez DOI-a: URL na kraju (Hrcak)',
    style: 'apa',
    inp: { type: 'clanak', authors: 'Kovac, Ivan', title: 'Naslov rada', container: 'Hrvatski casopis', volume: '12', issue: '3', pages: '45-60', url: 'https://hrcak.srce.hr/12345', year: '2020' },
    expect: 'Kovac, I. (2020). Naslov rada. Hrvatski casopis, 12(3), 45-60. https://hrcak.srce.hr/12345',
  },
  {
    label: 'Chicago clanak bez DOI-a: URL na kraju',
    style: 'chicago-author-date',
    inp: { type: 'clanak', authors: 'Kovac, Ivan', title: 'Naslov rada', container: 'Hrvatski casopis', volume: '12', issue: '3', pages: '45-60', url: 'https://hrcak.srce.hr/12345', year: '2020' },
    expect: 'Kovac, Ivan. 2020. "Naslov rada." Hrvatski casopis 12 (3): 45-60. https://hrcak.srce.hr/12345.',
  },
  {
    label: 'Chicago CMOS 9.61 elizija: 163-186 -> 163-86',
    style: 'chicago-author-date',
    inp: { type: 'clanak', authors: 'Smith, John', title: 'The subject matter', container: 'Journal of Testing', volume: '24', issue: '2', pages: '163-186', year: '2019' },
    expect: 'Smith, John. 2019. "The subject matter." Journal of Testing 24 (2): 163-86.',
  },
  {
    label: 'Chicago CMOS 9.61 elizija: 1087-1089 -> 1087-89',
    style: 'chicago-author-date',
    inp: { type: 'clanak', authors: 'Smith, John', title: 'Working memory', container: 'Journal of Memory', volume: '44', issue: '2', pages: '1087-1089', year: '2020' },
    expect: 'Smith, John. 2020. "Working memory." Journal of Memory 44 (2): 1087-89.',
  },
  {
    label: 'Chicago CMOS 9.61 elizija: 196-197 -> 196-97',
    style: 'chicago-author-date',
    inp: { type: 'clanak', authors: 'Smith, John', title: 'Working memory', container: 'Journal of Memory', volume: '44', issue: '2', pages: '196-197', year: '2020' },
    expect: 'Smith, John. 2020. "Working memory." Journal of Memory 44 (2): 196-97.',
  },
  {
    label: 'APA poglavlje 2 urednika: "A & B (Eds.)"',
    style: 'apa',
    inp: { type: 'poglavlje', authors: 'Franklin, Alan', title: 'Management of the problem', editor: 'S. M. Smith; A. Jones', container: 'The maltreatment of children', pages: '83-95', publisher: 'MTP Press', year: '2012' },
    expect: 'Franklin, A. (2012). Management of the problem. In S. M. Smith & A. Jones (Eds.), The maltreatment of children (pp. 83-95). MTP Press.',
  },
  {
    label: 'APA poglavlje 3 urednika: "A, B, & C (Eds.)"',
    style: 'apa',
    inp: { type: 'poglavlje', authors: 'Kalnay, Eugenia', title: 'Data assimilation', editor: 'R. Adams; B. Clark; C. Diaz', container: 'Handbook of numerical weather prediction', pages: '12-40', publisher: 'Springer', year: '2019' },
    expect: 'Kalnay, E. (2019). Data assimilation. In R. Adams, B. Clark, & C. Diaz (Eds.), Handbook of numerical weather prediction (pp. 12-40). Springer.',
  },
  {
    label: 'Harvard poglavlje 2 urednika: "A and B (eds)" (dvostruki navodnici zadrzani)',
    style: 'harvard',
    inp: { type: 'poglavlje', authors: 'Franklin, Alfred', title: 'Management of the problem', editor: 'Smith, S.M.; Brown, T.', container: 'The maltreatment of children', place: 'Lancaster', publisher: 'MTP Press', pages: '83-95', year: '2012' },
    expect: 'Franklin, A. (2012) "Management of the problem," in Smith, S.M. and Brown, T. (eds) The maltreatment of children. Lancaster: MTP Press, pp. 83-95.',
  },
  {
    label: 'Chicago mrezni: "Accessed <datum>. URL." (datum pred URL-om)',
    style: 'chicago-author-date',
    inp: { type: 'mrezni', authors: 'Horvat, Ivan', title: 'Naslov stranice', publisher: 'Institut za nesto', url: 'https://example.com/x', accessed: '5.7.2026.', year: '2020' },
    expect: 'Horvat, Ivan. 2020. "Naslov stranice." Institut za nesto. Accessed 5.7.2026. https://example.com/x.',
  },
];

describe('render golden (adversarijalni): render divergencije, workflow w1ljuzarh', () => {
  for (const c of ADV_REF) {
    it(`[${c.style}] ${c.label}`, () => {
      expect(formatCitation(c.inp, c.style).citation).toBe(c.expect);
    });
  }
});

/**
 * IN-TEXT (.inText) vjernih stilova: veznik i oznake se slazu s engleskim referentnim retkom
 * (apa "&"/"et al."/"n.d."; harvard "and"/"no date"; chicago "and"/"et al."/"n.d." bez zareza),
 * dok genericki 'autor-godina' zadrzava hrvatske ("i"/"i sur."/"bez dat."). render-check pokriva
 * samo .citation, pa in-text zakljucavamo ovdje.
 */
const ADV_INTEXT: Array<{ style: CitationStyle; inp: CitationInput; expect: string }> = [
  { style: 'apa', inp: { type: 'clanak', authors: 'Grady, John; Smith, Ann', year: '2019' }, expect: '(Grady & Smith, 2019)' },
  { style: 'apa', inp: { type: 'clanak', authors: 'Grady, John; Smith, Ann; Lee, Bo', year: '2019' }, expect: '(Grady et al., 2019)' },
  { style: 'apa', inp: { type: 'clanak', authors: 'Grady, John' }, expect: '(Grady, n.d.)' },
  { style: 'harvard', inp: { type: 'clanak', authors: 'Grady, John; Smith, Ann', year: '2019' }, expect: '(Grady and Smith 2019)' },
  { style: 'harvard', inp: { type: 'clanak', authors: 'Grady, John' }, expect: '(Grady no date)' },
  { style: 'chicago-author-date', inp: { type: 'clanak', authors: 'Grady, John; Smith, Ann', year: '2019' }, expect: '(Grady and Smith 2019)' },
  { style: 'chicago-author-date', inp: { type: 'clanak', authors: 'Grady, John; Smith, Ann; Lee, Bo; Ng, Ki', year: '2019' }, expect: '(Grady et al. 2019)' },
  { style: 'chicago-author-date', inp: { type: 'clanak', authors: 'Grady, John' }, expect: '(Grady n.d.)' },
  // Regresija: genericki autor-godina ostaje hrvatski (nepromijenjen).
  { style: 'autor-godina', inp: { type: 'clanak', authors: 'Grady, John; Smith, Ann', year: '2019' }, expect: '(Grady i Smith, 2019)' },
  { style: 'autor-godina', inp: { type: 'clanak', authors: 'Grady, John; Smith, Ann; Lee, Bo', year: '2019' }, expect: '(Grady i sur., 2019)' },
  { style: 'autor-godina', inp: { type: 'clanak', authors: 'Grady, John' }, expect: '(Grady, bez dat.)' },
];

describe('render golden (in-text): vjerni stilovi engleski, autor-godina hrvatski', () => {
  for (const c of ADV_INTEXT) {
    it(`[${c.style}] ${c.expect}`, () => {
      expect(formatCitation(c.inp, c.style).inText).toBe(c.expect);
    });
  }
});
