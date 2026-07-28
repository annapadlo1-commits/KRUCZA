/**
 * Jednorazowa, jawnie uruchamiana migracja 4.8.3.
 *
 * Nie jest automatyczną naprawą formuł. Zmienia wyłącznie formuły dokładnie
 * zgodne ze znanym, błędnym wariantem 4.8.2 używającym przecinków w SUM().
 * Przed pierwszą zmianą tworzy ukrytą kopię całej zakładki INWENTURA.
 */
function buildInventory483MigrationPlan_(sheet, products) {
  const plan = [];
  (products || []).forEach(function(product) {
    if (isDirectFinalInventoryProduct_(product)) return;
    const row = Number(product.inventoryRow);
    const type = String(product.type || '').trim().toUpperCase();
    const category = normalizeText(product.category || '');
    if (!row) return;

    const candidates = [];
    if (type === CONFIG.PRODUCT_TYPES.LOCATION) {
      candidates.push({
        column: 'D',
        oldFormula: '=SUM(B' + row + ',C' + row + ')',
        newFormula: '=B' + row + '+C' + row
      });
    } else {
      candidates.push({
        column: 'I',
        oldFormula: category === 'piwo'
          ? '=SUM(D' + row + ',H' + row + ')'
          : '=SUM(D' + row + ',E' + row + ',H' + row + ')',
        newFormula: category === 'piwo'
          ? '=D' + row + '+H' + row
          : '=D' + row + '+E' + row + '+H' + row
      });
    }

    candidates.forEach(function(candidate) {
      const range = sheet.getRange(candidate.column + row);
      const actual = range.getFormula();
      if (normalizeInventoryFormula_(actual) ===
          normalizeInventoryFormula_(candidate.oldFormula)) {
        plan.push({
          a1: candidate.column + row,
          oldFormula: actual,
          newFormula: candidate.newFormula
        });
      }
    });
  });
  return plan;
}

function migrateInventoryTo483_() {
  const sheet = getSheetByConfiguredName_(CONFIG.SHEETS.INVENTORY);
  if (!sheet) throw new Error('Nie znaleziono arkusza inwentury.');
  const plan = buildInventory483MigrationPlan_(sheet, scanInventoryProducts_());
  if (!plan.length) {
    normalizeInventoryNumberFormats_();
    return { changed: 0, backupSheet: '', formatted: true };
  }

  const backupSheet = createFormulaRepairBackupSheet_(sheet);
  plan.forEach(function(change) {
    const range = sheet.getRange(change.a1);
    if (normalizeInventoryFormula_(range.getFormula()) !==
        normalizeInventoryFormula_(change.oldFormula)) {
      throw new Error(
        'Komórka ' + change.a1 +
        ' została zmieniona podczas migracji. Operację przerwano.'
      );
    }
    range.setFormula(change.newFormula);
  });
  normalizeInventoryNumberFormats_();
  SpreadsheetApp.flush();

  const audit = buildInventoryFormulaAudit_(sheet, scanInventoryProducts_());
  if (!audit.safe) {
    throw new Error(
      'Migracja zakończyła zapis, ale audyt nadal wykrywa problemy. ' +
      'Zachowano kopię „' + backupSheet + '”.'
    );
  }
  return { changed: plan.length, backupSheet: backupSheet, formatted: true };
}

function migrateInventoryTo483() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.alert(
    'Inventory PRO — migracja 4.8.3',
    'Migracja utworzy kopię zakładki i zamieni wyłącznie znane błędne ' +
      'formuły 4.8.2. Kontynuować?',
    ui.ButtonSet.YES_NO
  );
  if (answer !== ui.Button.YES) return;
  const result = migrateInventoryTo483_();
  ui.alert(
    'Inventory PRO',
    result.changed
      ? 'Zmieniono formuły: ' + result.changed +
        '. Kopia bezpieczeństwa: ' + result.backupSheet + '.'
      : 'Nie znaleziono formuł 4.8.2 wymagających migracji. ' +
        'Uporządkowano format liczb.',
    ui.ButtonSet.OK
  );
}
