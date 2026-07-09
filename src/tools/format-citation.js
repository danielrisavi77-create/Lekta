// src/tools/format-citation.js
//
// Namjerno CommonJS/UMD-lite stil, ne ESM/TS: ova ista datoteka se doslovno
// ucitava u <script> tag generiranih statickih stranica (bez buildera, bez
// modula), a paralelno se importira u Node za testove i generator. Cist,
// jedan izvor istine, bez duplog odrzavanja logike.

(function (root) {
  function cleanupCitationText(text) {
    return text
      .replace(/\(\s*\)/g, '') // prazne zagrade PRIJE spajanja tocaka, redoslijed je bitan
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,;:])/g, '$1')
      .replace(/([.,;:])\1+/g, '$1')
      .replace(/\.\s*\./g, '.')
      .replace(/\s+\./g, '.')
      .trim();
  }

  function formatCitation(template, fields) {
    var raw = template.replace(/\{(\w+)\}/g, function (_, key) {
      var value = fields && fields[key];
      return value ? String(value).trim() : '';
    });
    return cleanupCitationText(raw);
  }

  var api = { formatCitation: formatCitation, cleanupCitationText: cleanupCitationText };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LektaCitation = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
