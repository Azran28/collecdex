/*
 * Scanner — scans du classeur et de la rafale envoyés au labo de Claude (comptes testeurs, js/scan-share.js) — morceau de la fonction
 * de scan-batch.js (état partagé : X.S).
 * v3.61, Arnaud : « la photo entière de chaque page, et les cases non enregistrées ». La page part une fois (photo entière + résumé
 * des cases), chaque carte enregistrée y est reliée (page, cell) ; à la sortie de la page (nouvelle photo, page suivante, rafale
 * remise à zéro), les cases pas enregistrées partent aussi (kind 'ignoree'). Rien pour les autres comptes (labOn).
 */
App.scanBatchParts = App.scanBatchParts || {};
App.scanBatchParts.labo = (X, { R, burst, modeQ }) => {
  const { S } = X;
  const labOn = () => !!(App.scanShare && App.cloud && App.cloud.user);
  const proposedOf = (c) => { const sys = c.sys || { choice: c.choice, cands: c.cands || [] }, top = (sys.cands || []).find((x) => x.id === sys.choice); return { top, list: top ? [top, ...sys.cands.filter((x) => x !== top)] : (sys.cands || []) }; };
  const readOf = (c) => { try { return c.info ? R.readSummary(c.info) : ''; } catch (err) { return ''; } };
  const cellsSummary = () => S.cells.map((c) => ({ i: c.i, box: c.box || null, etat: c.state || '', choix: c.choice || '', enreg: !!c.saved, cands: proposedOf(c).list.slice(0, 3).map((x) => x.id + (x.confident ? '✓' : '')) }));
  function labPage() {
    if (!labOn() || burst || !S.photo || !S.photo.blob || !S.cells.length) return null;
    if (S.labPage) { App.scanShare.label(S.labPage, { cells: cellsSummary() }); return S.labPage; }
    S.labPage = App.scanShare.scan({ game: S.game, mode: 'classeur', kind: 'page', extra: { cells: cellsSummary() } }, S.photo.blob);
    return S.labPage;
  }
  function labLeftover() {
    if (!labOn() || !S.cells.length) { S.labPage = null; return; }
    const page = labPage();
    for (const c of S.cells) {
      if (c.saved || c.labSent || !c.blob) continue;
      c.labSent = true;
      App.scanShare.scan({ game: S.game, mode: modeQ, kind: 'ignoree', cands: proposedOf(c).list, read: readOf(c), extra: { page, cell: c.i, etat: c.state || '', choix: c.choice || '' } }, c.blob);
    }
    S.labPage = null;
  }
  return { labPage, labLeftover, proposedOf, readOf };
};
