import re, os, shutil, zipfile, subprocess, sys
from xml.sax.saxutils import escape

S = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(S, 'template.pptx')
WORK = os.path.join(S, 'work')
OUT = os.path.join(S, 'Freisenbruch_Benefits_Advisory_Strategic_Plan_2027-2029.pptx')
SKILL = '/root/.claude/skills/synced/d9b3234f-f9cf-4a81-912e-516665a9e0c7_e9fc4e92-aa28-45e2-a44b-7e9fb9740472/pptx/scripts'

if os.path.exists(WORK):
    shutil.rmtree(WORK)
os.makedirs(WORK)
zipfile.ZipFile(SRC).extractall(WORK)

def slide_path(n):
    return os.path.join(WORK, 'ppt', 'slides', f'slide{n}.xml')

def read(n):
    return open(slide_path(n), encoding='utf-8').read()

def write(n, x):
    open(slide_path(n), 'w', encoding='utf-8').write(x)

# ---------- XML builders ----------
BULLET_PPR = ('<a:pPr marL="228600" indent="-228600"><a:spcBef><a:spcPts val="{spc}"/></a:spcBef>'
              '<a:buFont typeface="Arial" panose="020B0604020202020204" pitchFamily="34" charset="0"/>'
              '<a:buChar char="&#8226;"/></a:pPr>')
PLAIN_PPR = '<a:pPr marL="0" indent="0"><a:spcBef><a:spcPts val="{spc}"/></a:spcBef><a:buNone/></a:pPr>'
NUM_PPR = ('<a:pPr marL="342900" indent="-342900"><a:spcBef><a:spcPts val="{spc}"/></a:spcBef>'
           '<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/></a:pPr>')

def rpr(sz, bold=False, color='000000', font=None):
    b = ' b="1"' if bold else ' b="0"'
    f = ''
    if font:
        f = f'<a:latin typeface="{font}" panose="020B0004020202020204" pitchFamily="34" charset="0"/>'
    return f'<a:rPr lang="en-US" sz="{sz}"{b} dirty="0"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill>{f}</a:rPr>'

def t(text):
    e = escape(text)
    if text != text.strip():
        return f'<a:t xml:space="preserve">{e}</a:t>'
    return f'<a:t>{e}</a:t>'

def para(text, sz, bold=False, kind='plain', spc=0, color='000000', font=None):
    ppr = {'plain': PLAIN_PPR, 'bullet': BULLET_PPR, 'num': NUM_PPR}[kind].format(spc=spc)
    return f'<a:p>{ppr}<a:r>{rpr(sz, bold, color, font)}{t(text)}</a:r></a:p>'

def section(header, items, hsz, bsz, first=False, header_spc=1000, item_spc=200, font=None):
    out = [para(header, hsz, bold=True, spc=0 if first else header_spc, font=font)]
    out += [para(i, bsz, kind='bullet', spc=item_spc, font=font) for i in items]
    return ''.join(out)

def txbody(paras, anchor=None, autofit=False):
    a = f' anchor="{anchor}"' if anchor else ''
    fit = '<a:normAutofit/>' if autofit else ''
    return f'<p:txBody><a:bodyPr wrap="square" rtlCol="0"{a}>{fit}</a:bodyPr><a:lstStyle/>{paras}</p:txBody>'

def replace_shape_body(xml, name, new_body, xfrm=None):
    """Replace the txBody of the <p:sp> whose cNvPr name == name."""
    pat = re.compile(r'<p:sp>(.*?)</p:sp>', re.S)
    found = False
    def sub(m):
        nonlocal found
        s = m.group(0)
        if f'name="{name}"' not in s or found:
            return s
        found = True
        s = re.sub(r'<p:txBody>.*?</p:txBody>', lambda _: new_body, s, count=1, flags=re.S)
        if xfrm:
            x, y, cx, cy = [int(v * 914400) for v in xfrm]
            s = re.sub(r'<a:off x="\d+" y="\d+"/><a:ext cx="\d+" cy="\d+"/>',
                       f'<a:off x="{x}" y="{y}"/><a:ext cx="{cx}" cy="{cy}"/>', s, count=1)
        return s
    xml = pat.sub(sub, xml)
    assert found, f'shape {name} not found'
    return xml

def set_title(xml, text):
    return re.sub(r'(<a:t>)[^<]*Strategic[^<]*(</a:t>)|(<a:t>)[^<]*(Assessment|SWOT|Improvement|Talent|Outlook|Success Statement)[^<]*(</a:t>)',
                  lambda m: f'<a:t>{escape(text)}</a:t>', xml, count=1)

def cell(paras, tcpr):
    return f'<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>{paras}</a:txBody>{tcpr}</a:tc>'

def row(h, cells):
    return f'<a:tr h="{h}">{"".join(cells)}</a:tr>'

def get_rows(xml):
    tbl = re.search(r'<a:tbl>.*?</a:tbl>', xml, re.S).group(0)
    return tbl, re.findall(r'<a:tr h="\d+">.*?</a:tr>', tbl, re.S)

def tcpr_of(cell_xml):
    return re.search(r'<a:tcPr(?:\s[^>]*)?/>|<a:tcPr(?:\s[^>]*)?>.*?</a:tcPr>', cell_xml, re.S).group(0)

def cells_of(row_xml):
    return re.findall(r'<a:tc>.*?</a:tc>', row_xml, re.S)

# =====================================================================
# Slide 1: cover
# =====================================================================
x = read(1)
x = x.replace('<a:t>Corporate Insurance </a:t>', '<a:t>Benefits Advisory</a:t>')
x = x.replace('<a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="3600"', '<a:lstStyle/><a:p><a:pPr marL="0" indent="0"><a:buNone/></a:pPr><a:r><a:rPr lang="en-US" sz="3600"', 1)
write(1, x)

# =====================================================================
# Slide 2: Strategic Assessment
# =====================================================================
x = read(2)
x = x.replace('1. Strategic Assessment – Current State', '1. Strategic Assessment: Current State')
left = (
    section('Working Well', [
        'Steady demand, all of it word of mouth. We have not marketed the practice yet.',
        'Clients landed and a robust pipeline.',
        'Employer-advocate positioning: employer-paid fees only, no commission.',
    ], 1700, 1400, first=True)
    + section('Challenges', [
        'Team of one.',
        'Limited placement market: only Allshores and CG.',
    ], 1700, 1400)
    + section('Top Risks', [
        'Insurer pushback or reduced cooperation.',
        'Key-person dependence on the Head of Benefits Advisory.',
    ], 1700, 1400)
)
right = (
    section('2029 Vision', [
        'Bermuda\'s recognized independent employer advocate for group benefits.',
        'Supplemental placements with overseas carriers (Aetna, Cigna, GBG, Bupa, AXA Global Healthcare, Allianz Care, Sagicor) to control cost and spread risk.',
        'A team that does not depend on one person.',
    ], 1700, 1400, first=True)
    + section('Success Measures', [
        '$500k in annual one-time project revenue.',
        '$12k per month in recurring retainer revenue.',
        'Team of three.',
    ], 1700, 1400)
)
x = replace_shape_body(x, 'Text 1', txbody(left, anchor='t'), xfrm=(0.4, 0.75, 4.3, 5.4))
x = replace_shape_body(x, 'Text 2', txbody(right, anchor='t'), xfrm=(4.95, 0.75, 4.65, 5.4))
write(2, x)

# =====================================================================
# Slide 3: Strategic Priorities table
# =====================================================================
x = read(3)
tbl, rows = get_rows(x)
header = rows[0]
body_tcpr = [tcpr_of(c) for c in cells_of(rows[1])]
SZ = 1000
def tcell(lines, tcpr, bold_first=False):
    ps = []
    for i, l in enumerate(lines):
        if len(lines) == 1:
            ps.append(para(l, SZ, bold=bold_first))
        else:
            ps.append(para(l, SZ, kind='bullet', spc=200 if i else 0))
    return cell(''.join(ps), tcpr)
priorities = [
    (['Grow the advisory book'],
     ['Larger, diversified client base', 'Recurring retainer revenue alongside project fees'],
     ['Marketing budget', 'Capacity freed by the deputy hire', 'Client management system'],
     ['2027 onwards'],
     ['Clients under advisory', '$500k annual project revenue and $12k monthly recurring by 2029']),
    (['Build admin and benchmarking infrastructure'],
     ['Scalable delivery and consistent servicing standards', 'Faster, evidence-based renewals'],
     ['Invoicing and client management system', 'Benchmarking database', 'AI tooling and IT support'],
     ['2026 to 2027'],
     ['Renewal cycle time', 'Invoicing accuracy', 'Benchmark reports produced each year']),
    (['Hire a deputy and build succession'],
     ['Capacity to serve pipeline demand', 'No single-person dependency'],
     ['One all-round Benefits Advisor: client meetings, benefits analysis, data, renewals', 'Third team member by 2029'],
     ['Hire in 2027', 'Team of three by 2029'],
     ['Deputy independently running renewals', 'Cover in place for absences', 'Clients served per head']),
    (['Intentional marketing and market visibility'],
     ['Freisenbruch known as Bermuda\'s independent employer advocate', 'Inbound demand beyond word of mouth'],
     ['Marketing plan and budget', 'Speaking at industry events', 'Published benchmarking insights'],
     ['2027 onwards'],
     ['Inbound inquiries and RFP invitations', 'Speaking invitations', 'Share of pipeline from marketing']),
]
H = 1000000
new_rows = [header] + [row(H, [tcell(col, body_tcpr[i]) for i, col in enumerate(p)]) for p in priorities]
new_tbl = tbl.split('<a:tr ')[0] + ''.join(new_rows) + '</a:tbl>'
x = x.replace(tbl, new_tbl)
x = x.replace('<a:t>Strategic Priorities 2027-2029</a:t>', '<a:t>Strategic Priorities 2027-2029</a:t>')
write(3, x)

# =====================================================================
# Slide 4: SWOT
# =====================================================================
x = read(4)
tbl, rows = get_rows(x)
tc = [[tcpr_of(c) for c in cells_of(r)] for r in rows]
FONT = 'Aptos'
def swot_cell(title, items, tcpr):
    ps = [para(title, 1250, bold=True, font=FONT)]
    ps += [para(i, 1250, kind='bullet', spc=200, font=FONT) for i in items]
    return cell(''.join(ps), tcpr)
r0 = row(1820536, [
    swot_cell('Strengths', [
        'Deep market expertise and long-standing relationships',
        'Employer-advocate positioning',
        'Fee-only independence: employer paid, no commission',
        'Freisenbruch brand, license, and infrastructure',
        'Clients landed and a robust pipeline',
    ], tc[0][0]),
    swot_cell('Weaknesses', [
        'Team of one',
        'Limited options to place business (CG, Allshores)',
    ], tc[0][1]),
])
r1 = row(2464593, [
    swot_cell('Opportunities', [
        'Intentional marketing',
        'Monthly retainer servicing for off-island HR teams',
        'Coordination of benefits for employers holding overseas and Bermuda coverage',
        'Cross-referrals from Corporate Insurance and Pensions',
        'Employers frustrated with renewal increases',
    ], tc[1][0]),
    swot_cell('Threats', [
        'Insurer pushback or reduced cooperation',
        'Only two local placement markets',
        'Competing advisory practices',
    ], tc[1][1]),
])
new_tbl = tbl.split('<a:tr ')[0] + r0 + r1 + '</a:tbl>'
x = x.replace(tbl, new_tbl)
write(4, x)

# =====================================================================
# Slide 5: Business Improvement Opportunities
# =====================================================================
x = read(5)
body = (
    section('Growth Opportunities', [
        'Intentional marketing to turn word-of-mouth demand into a managed pipeline.',
        'Monthly retainer model: servicing standards, Bermuda benefits advisor to off-island HR teams, and coordination of benefits for employers holding both overseas and Bermuda coverage.',
        'Cross-referrals with Corporate Insurance and Pensions clients.',
    ], 1800, 1600, first=True, header_spc=1400, item_spc=400)
    + section('Technology and Process', [
        'Invoicing and client management system.',
        'Benchmarking database of Bermuda plan designs and rates.',
        'AI tooling for renewal analysis, reporting, and client deliverables.',
        'Documented servicing standards and renewal playbook so delivery does not depend on one person.',
    ], 1800, 1600, header_spc=1400, item_spc=400)
)
x = replace_shape_body(x, 'TextBox 1', txbody(body, anchor='t'), xfrm=(0.4, 0.85, 9.2, 5.3))
write(5, x)

# =====================================================================
# Slide 7: Talent Planning Review
# =====================================================================
x = read(7)
body = (
    section('Talent Assessment', [
        'One person covers sales, client servicing, benefits analysis, renewals, negotiations, and administration.',
    ], 1600, 1400, first=True, header_spc=900, item_spc=300)
    + section('Challenges', [
        'Capacity ceiling: demand already exceeds what one person can serve.',
        'Every hour spent on delivery is an hour not spent on growth. No cover for absence.',
    ], 1600, 1400, header_spc=900, item_spc=300)
    + section('Future Requirements', [
        'An all-round deputy who meets clients and runs benefits analysis, data, and renewals (2027).',
        'Third team member by 2029.',
    ], 1600, 1400, header_spc=900, item_spc=300)
    + section('Skills Gap', [
        'Analytical and client-servicing depth currently sits with one person and must be built into the team.',
    ], 1600, 1400, header_spc=900, item_spc=300)
    + section('Risk if not completed', [
        'Key-person dependence and no succession.',
        'Revenue capped at one person\'s hours; pipeline demand goes unmet.',
        'Service standards at risk during any absence.',
    ], 1600, 1400, header_spc=900, item_spc=300)
)
x = replace_shape_body(x, 'TextBox 1', txbody(body, anchor='t'), xfrm=(0.4, 0.75, 9.2, 5.5))
write(7, x)

# =====================================================================
# Slide 8: Strategic Outlook threats table
# =====================================================================
x = read(8)
tbl, rows = get_rows(x)
header = rows[0]
hdr_cells = cells_of(header)
# Rename first header cell
header = header.replace('Great Threats to Achieving Objectives', 'Greatest Threats to Achieving Objectives')
for old, new in zip(['1326776', '2923391', '2125084', '2125084'], ['1500000', '2700000', '2800000', '1500335']):
    x = x.replace(f'<a:gridCol w="{old}"', f'<a:gridCol w="{new}"', 1)
tbl, rows = get_rows(x)
tcpr_body = [tcpr_of(c) for c in cells_of(rows[1])]
TSZ = 1100
def tcell8(lines, tcpr):
    if len(lines) == 1:
        return cell(para(lines[0], TSZ), tcpr)
    return cell(''.join(para(l, TSZ, kind='bullet', spc=200 if i else 0) for i, l in enumerate(lines)), tcpr)
threats = [
    (['Insurer pushback or reduced cooperation'],
     ['Fewer competitive quotes and weaker negotiating leverage',
      'Slower renewals and less data for clients',
      'Placement market narrows further'],
     ['Keep insurer relationships professional and transparent',
      'Evidence-based negotiation that insurers can defend internally',
      'Develop supplemental options with overseas carriers'],
     ['Michelle Jackson']),
    (['Key-person dependence'],
     ['No cover for absence',
      'Growth capped at one person\'s capacity',
      'Client and revenue risk if the practice lead is unavailable'],
     ['Hire an all-round deputy in 2027',
      'Document processes, servicing standards, and renewal playbooks',
      'Build client relationships across the team, not one person'],
     ['Michelle Jackson']),
]
RH = 1700000
new_rows = [header] + [row(RH, [tcell8(col, tcpr_body[i]) for i, col in enumerate(tr)]) for tr in threats]
new_tbl = tbl.split('<a:tr ')[0] + ''.join(new_rows) + '</a:tbl>'
x = x.replace(tbl, new_tbl)
write(8, x)

# =====================================================================
# Slide 9: Strategic Outlook questions
# =====================================================================
x = read(9)
body = (
    para('What opportunities should FM prioritize over the next three years?', 1700, bold=True)
    + para('Hiring an all-round deputy to remove key-person dependence and unlock capacity.', 1600, kind='num', spc=800)
    + para('Intentional marketing to turn word-of-mouth demand into a managed pipeline.', 1600, kind='num', spc=400)
    + para('Admin and benchmarking infrastructure so the practice scales without adding cost.', 1600, kind='num', spc=400)
    + para('What advantage can FM create, and what must be true for the opportunity to succeed?', 1700, bold=True, spc=2000)
    + para('Freisenbruch\'s advantage is being the only fee-only, employer-side benefits advisor in Bermuda, backed by an established licensed firm.', 1600, spc=800)
    + para('For this to succeed, the practice needs a second person and a deliberate marketing push.', 1600, spc=800)
)
x = replace_shape_body(x, 'TextBox 1', txbody(body, anchor='t'), xfrm=(0.4, 0.85, 9.2, 5.3))
write(9, x)

# =====================================================================
# Slide 10: 2029 Success Statement
# =====================================================================
x = read(10)
body = (
    para('Employers in Bermuda name Freisenbruch first when they want independent benefits advice.', 2000, kind='num')
    + para('The practice runs with a team of three.', 2000, kind='num', spc=1200)
    + para('The practice generates $500k in annual one-time project revenue plus $12k per month in recurring retainer revenue.', 2000, kind='num', spc=1200)
)
x = replace_shape_body(x, 'Text 1', txbody(body, anchor='ctr'))
write(10, x)

# =====================================================================
# Delete slide 6 (Expenses Management / Stop Doing: no content)
# =====================================================================
pres = os.path.join(WORK, 'ppt', 'presentation.xml')
px = open(pres, encoding='utf-8').read()
rels = open(os.path.join(WORK, 'ppt', '_rels', 'presentation.xml.rels'), encoding='utf-8').read()
rid = re.search(r'Id="(rId\d+)"[^>]*Target="slides/slide6.xml"', rels).group(1)
px = re.sub(rf'<p:sldId id="\d+" r:id="{rid}"/>', '', px)
open(pres, 'w', encoding='utf-8').write(px)
subprocess.run([sys.executable, os.path.join(SKILL, 'clean.py'), WORK], check=True)

# =====================================================================
# Zip
# =====================================================================
if os.path.exists(OUT):
    os.remove(OUT)
subprocess.run(['zip', '-Xr', OUT, '.'], cwd=WORK, check=True, stdout=subprocess.DEVNULL)
print('wrote', OUT)
