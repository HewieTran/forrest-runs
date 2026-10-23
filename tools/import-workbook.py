"""Read only Dashboard and Workout Tracker. Output stays outside source control."""
import sys,json,zipfile,xml.etree.ElementTree as E,posixpath,datetime,gzip,base64
from pathlib import Path
p=Path(sys.argv[1]); out=Path(sys.argv[2]);n={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def date(v):return (datetime.date(1899,12,30)+datetime.timedelta(days=float(v))).isoformat()
def number(v):
 try:return float(v) if v is not None else None
 except (ValueError,TypeError):return None
with zipfile.ZipFile(p) as z:
 ss=[''.join(e.itertext()) for e in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',n)] if 'xl/sharedStrings.xml' in z.namelist() else []
 rel={r.attrib['Id']:r.attrib['Target'] for r in E.fromstring(z.read('xl/_rels/workbook.xml.rels'))};sheets={}
 for sh in E.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',n):
  name=sh.attrib['name']
  if name not in ('Dashboard','Workout Tracker'):continue
  t=rel[sh.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']];path=t.lstrip('/') if t.startswith('/') else posixpath.normpath('xl/'+t);rows=[]
  for row in E.fromstring(z.read(path)).findall('s:sheetData/s:row',n):
   r={}
   for c in row.findall('s:c',n):
    v=c.find('s:v',n);i=c.find('s:is',n);val=v.text if v is not None else ''.join(i.itertext()) if i is not None else None
    if c.attrib.get('t')=='s' and val is not None:val=ss[int(val)]
    if val is not None:r[''.join(x for x in c.attrib['r'] if x.isalpha())]=val
   if r:rows.append((int(row.attrib['r']),r))
  sheets[name]=rows
 dashboard={row:r for row,r in sheets['Dashboard']};workouts=[]
 for row,r in sheets['Workout Tracker']:
  if row==1 or not r.get('A'):continue
  workouts.append(dict(date=date(r['A']),phase=r.get('C',''),type=r.get('D',''),plannedWorkout=r.get('E',''),targetPace=r.get('F',''),done=r.get('G')=='☑',actualDistance=number(r.get('H')),actualPace=r.get('I',''),effort=number(r.get('J')),pain=r.get('K',''),notes=r.get('L',''),sourceRow=row,originalSource=r))
 guide=[{'type':r['E'],'target':r.get('F',''),'rule':r.get('G','')} for row,r in sheets['Dashboard'] if 6<=row<=9 and 'E'in r]
 payload={'raceName':dashboard[5].get('C','Dallas Marathon'),'raceDate':date(dashboard[5]['B']),'paceGuide':guide,'sourceName':p.name,'workouts':workouts}
 out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(payload),encoding='utf8')
 packed=base64.b64encode(gzip.compress(json.dumps(payload,separators=(',',':')).encode(),mtime=0)).decode()
 chunks=[packed[i:i+4000] for i in range(0,len(packed),4000)]
 out.with_suffix('.env.json').write_text(json.dumps({f'TRAINING_SEED_{i+1}':c for i,c in enumerate(chunks)}))
 print(json.dumps({'workouts':len(workouts),'completed':sum(w['done'] for w in workouts),'seed_chunks':len(chunks),'seed_bytes':len(packed)}))
