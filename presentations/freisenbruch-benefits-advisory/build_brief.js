const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType,
  AlignmentType, BorderStyle, Header, Footer, ImageRun, HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom, PageNumber, LevelFormat, TabStopType, PageBreak,
} = require('docx');

const ASSETS = '/root/.claude/skills/synced/d9b3234f-f9cf-4a81-912e-516665a9e0c7_e9fc4e92-aa28-45e2-a44b-7e9fb9740472/freisenbruch-brand/assets/';
const NAVY = '1B305F', GREY = '5A5A5A', H2BLUE = '1F4E9C', RULE = '8EA3C8', BLACK = '000000';
const FONT = 'Calibri';

const band = fs.readFileSync(ASSETS + 'header_band.png');

function run(text, opts = {}) {
  return new TextRun({ text, font: FONT, size: opts.size || 22, bold: opts.bold, italics: opts.italics, color: opts.color || BLACK });
}
function body(text, opts = {}) {
  return new Paragraph({ spacing: { after: 100, line: 252 }, alignment: AlignmentType.LEFT, children: [run(text, opts)] });
}
function mixed(parts, opts = {}) {
  return new Paragraph({ spacing: { after: 120, line: 264 }, children: parts.map(p => typeof p === 'string' ? run(p) : run(p.t, p)) , ...opts });
}
function h1(text) {
  return new Paragraph({
    spacing: { before: 200, after: 100 }, keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE, space: 2 } },
    children: [run(text, { size: 30, bold: true, color: NAVY })],
  });
}
function h2(text) {
  return new Paragraph({ spacing: { before: 140, after: 60 }, keepNext: true, children: [run(text, { size: 25, color: H2BLUE, bold: true })] });
}
function bullet(text, level = 0) {
  return new Paragraph({ numbering: { reference: 'bullets', level }, spacing: { after: 40, line: 252 }, children: [run(text)] });
}
function bulletMixed(parts) {
  return new Paragraph({ numbering: { reference: 'bullets', level: 0 }, spacing: { after: 60, line: 264 }, children: parts.map(p => typeof p === 'string' ? run(p) : run(p.t, p)) });
}

const cellBorder = { style: BorderStyle.SINGLE, size: 4, color: 'BFC7D9' };
const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
function cell(text, width, opts = {}) {
  const paras = (Array.isArray(text) ? text : [text]).map(t => new Paragraph({
    spacing: { after: 40, line: 252 },
    children: [run(t, { size: 19, bold: opts.bold, color: opts.color || BLACK })],
  }));
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: 'auto' } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: paras,
  });
}
function table(widths, rows) {
  return new Table({
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows: rows.map((r, i) => new TableRow({
      tableHeader: i === 0, cantSplit: true,
      children: r.map((c, j) => i === 0
        ? cell(c, widths[j], { bold: true, color: 'FFFFFF', fill: NAVY })
        : cell(c, widths[j], { fill: i % 2 === 0 ? 'F2F4F8' : undefined })),
    })),
  });
}

const header = new Header({
  children: [new Paragraph({
    children: [new ImageRun({
      type: 'png', data: band,
      transformation: { width: 816, height: 75.5 },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
        behindDocument: true, allowOverlap: true,
      },
    })],
  })],
});

const footer = new Footer({
  children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: 9360 }],
    children: [
      new TextRun({ text: 'Confidential. Prepared for discussion under NDA. Freisenbruch Insurance Services Ltd.', font: FONT, size: 18, color: GREY }),
      new TextRun({ text: '\tPage ', font: FONT, size: 18, color: GREY }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 18, color: GREY }),
      new TextRun({ text: ' of ', font: FONT, size: 18, color: GREY }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: 18, color: GREY }),
    ],
  })],
});

const W = 9360;
const children = [
  new Paragraph({ spacing: { after: 40 }, children: [run('PROGRAM BRIEF', { size: 20, bold: true, color: GREY })] }),
  new Paragraph({ spacing: { after: 60 }, children: [run('Bermuda Employer Health Program', { size: 34, bold: true, color: NAVY })] }),
  new Paragraph({ spacing: { after: 200 }, children: [run('A proposed program administration structure with IMG and SiriusPoint  |  Prepared by Michelle Jackson, Head of Benefits Advisory  |  [Month] 2026  |  DRAFT', { size: 20, color: GREY })] }),

  h1('1. Purpose'),
  body('This brief sets out a proposed structure for a Bermuda employer health program and the roles we would ask IMG and SiriusPoint to consider in it. It is a discussion document, not a specification. We are looking for a partner who wants to build something in Bermuda with us, and we want to hear where you would design it differently.'),

  h1('2. Who we are'),
  body('Freisenbruch Insurance Services Ltd. was established in 1980 and is one of Bermuda\'s leading independent insurance providers. The firm is co-owned by FM Investments (Holding) Ltd. and Chubb Bermuda Insurance Ltd., which also serves as the primary reinsurer for Freisenbruch Insurance Limited, a Class 3A insurer regulated by the Bermuda Monetary Authority.'),
  body('Freisenbruch Benefits Advisory is the firm\'s employer-side benefits practice. We act solely for employers: independent advice, insurer negotiation, plan design, benchmarking, renewal management, and compliance. We are paid by the employer, never by an insurer. The practice is led by Michelle Jackson, formerly Executive Vice President at Argus Group and BF&M, with more than twenty years in Bermuda group health.'),

  h1('3. Why Bermuda, and why now'),
  bullet('Every employer in Bermuda must provide health coverage that meets the Standard Health Benefit, so the market is mandatory, fully insured by habit, and concentrated in two carriers, Allshores and CG Coralisle.'),
  bullet('Employers are absorbing sustained renewal increases with no independent alternative to the two-carrier renewal cycle.'),
  bullet('A meaningful share of medical spend is delivered overseas, principally in Boston, Baltimore, and New York. US network access, repricing, and cost containment therefore drive plan economics more than on-island claims do.'),
  bullet('Freisenbruch already advises employers on their plans. Several have asked us to go further and put an administered alternative in front of them. That is the demand this program answers.'),

  h1('4. Proposed structure'),
  body('A level-funded employer health program in which Freisenbruch acts as program administrator, IMG administers the overseas layer, and a capacity provider supplies the policy paper and stop loss. Freisenbruch earns program fees and a share of underwriting result. It does not carry claims risk on its balance sheet.'),
  table([2100, 4400, 2860], [
    ['Party', 'Role in the program', 'Economics'],
    ['Freisenbruch Health (program administrator)',
     ['Product design and pricing within agreed underwriting guidelines', 'Distribution through Benefits Advisory and the Freisenbruch broking channel', 'Bermuda-facing administration: eligibility, employer billing, on-island provider claims against the Standard Health Benefit and BHB fee schedules, member service, Bermuda Health Council reporting'],
     ['Program administration fee (PMPM)', 'Share of underwriting result', 'No claims risk retained']],
    ['IMG (overseas administrator)',
     ['Claims administration for care delivered outside Bermuda', 'US network access through UnitedHealthcare and First Health PPO arrangements, plus IMG\'s international provider network', 'Repricing, cost containment, pre-certification, and case management for overseas treatment', '24/7 medical and travel assistance'],
     ['Administration fee for the overseas layer (PMPM or per-claim)', 'Cost-containment fees on agreed basis']],
    ['Capacity provider (SiriusPoint Accident & Health and/or Chubb)',
     ['Policy paper for the program', 'Specific and aggregate stop loss above the employer claims fund', 'Reinsurance of any fronting carrier'],
     ['Stop-loss premium and risk margin']],
    ['Employer client',
     ['Funds a claims account up to the aggregate attachment point through a level monthly payment', 'Receives full claims transparency and a share of surplus at year end'],
     ['Level monthly payment: claims fund, stop loss, administration']],
  ]),
  body(''),
  h2('How the money flows'),
  body('The employer pays one level monthly amount. Freisenbruch holds the claims account and pays on-island claims it adjudicates. IMG adjudicates overseas claims and draws on the same account. Stop loss responds above the specific and aggregate attachment points. Surplus at year end is shared with the employer, with a portion retained in a claims fluctuation reserve to smooth future renewals.'),
  h2('What Freisenbruch brings'),
  bullet('An existing advisory client base and pipeline of Bermuda employers who trust us to act for them.'),
  bullet('Deep working knowledge of Bermuda fee schedules, the Standard Health Benefit, BHB billing, and the regulatory environment.'),
  bullet('A licensed Bermuda insurer in the group, with Chubb as co-owner and reinsurer, to anchor the regulatory pathway.'),

  h1('5. What we are asking'),
  h2('Of IMG'),
  bullet('Confirm appetite to administer the overseas layer for a Bermuda employer program at [X] lives in year one and [Y] by year three.'),
  bullet('Adjudicate one sample Bermuda hospital claim and one sample US claim under the proposed rules and show us the output, the repricing, and the data you would return to us.'),
  bullet('Indicative pricing for the overseas layer, expressed PMPM, with any minimum-lives or minimum-fee thresholds.'),
  bullet('Confirm data ownership: Freisenbruch owns all claims, eligibility, and member data and receives it in a usable format on a monthly basis.'),
  bullet('Service standards: claims turnaround, member call answer times, and pre-certification response times, with reporting against each.'),
  bullet('White-label member experience under the Freisenbruch brand, including ID cards and member portal.'),
  bullet('Implementation timeline and the team you would assign.'),
  h2('Of SiriusPoint'),
  bullet('Appetite to provide stop loss and, if required, policy paper for a Bermuda health program administered by a group company.'),
  bullet('Preferred structure: direct issue, fronting through Freisenbruch Insurance Limited with reinsurance to SiriusPoint, or a quota-share arrangement.'),
  bullet('Underwriting guidelines you would want Freisenbruch to operate within.'),

  h1('6. Regulatory pathway: open items'),
  body('These are the questions we need to resolve together before the structure is final. We do not assume the answers.'),
  bullet('The issuing carrier must be licensed to write health insurance in Bermuda under the Health Insurance Act 1970 and registered with the Bermuda Health Council. We will confirm whether Freisenbruch Insurance Limited extends its license, or whether the program issues on other paper.'),
  bullet('Bermuda Monetary Authority notification or approval for the program and for any reinsurance arrangement.'),
  bullet('Chubb\'s position as co-owner and primary reinsurer of Freisenbruch Insurance Limited, including consent to any SiriusPoint capacity in the structure.'),
  bullet('Treatment of the Standard Health Benefit and the Mutual Reinsurance Fund within a level-funded design.'),

  new Paragraph({ children: [new PageBreak()] }),
  h1('7. Proposed next steps'),
  table([1800, 5300, 2260], [
    ['Step', 'What happens', 'Timing'],
    ['1. NDA', 'Mutual NDA between Freisenbruch, IMG, and SiriusPoint', '[Month]'],
    ['2. Discovery', 'Working session on program design, the Bermuda claim test, and regulatory pathway', '[Month]'],
    ['3. Indicative terms', 'IMG administration pricing and SiriusPoint capacity terms', '[Month]'],
    ['4. Pilot design', 'One employer client, full year, with agreed success measures', '[Month]'],
    ['5. Launch', 'Program available to Bermuda employers for the [2027] renewal cycle', '[2027]'],
  ]),
  body(''),
  h1('8. Contact'),
  body('Michelle Jackson, Head of Benefits Advisory, Freisenbruch Insurance Services Ltd.'),
  body('75 Front Street, Hamilton HM 12, Bermuda  |  [phone]  |  [email]', { color: GREY, size: 20 }),
];

const doc = new Document({
  styles: { default: { document: { run: { font: FONT, size: 22 } } } },
  numbering: {
    config: [{
      reference: 'bullets',
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360, hanging: 240 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 240 } } } },
      ],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1400, bottom: 1000, left: 1440, right: 1440, header: 0, footer: 500 },
      },
    },
    headers: { default: header },
    footers: { default: footer },
    children,
  }],
});

Packer.toBuffer(doc).then(buf => {
  const out = __dirname + '/Freisenbruch_Program_Brief_IMG_SiriusPoint_DRAFT.docx';
  fs.writeFileSync(out, buf);
  console.log('wrote', out);
});
