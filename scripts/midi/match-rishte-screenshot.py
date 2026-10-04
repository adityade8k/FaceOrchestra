from pathlib import Path
import struct,zlib,json
root=Path(__file__).resolve().parents[2]/'src/compositions/rishte-naate'
p=root/'melody-reference.png';data=p.read_bytes();w,h,depth,color,_,_,interlace=struct.unpack('>IIBBBBB',data[16:29]);assert(depth,color,interlace)==(8,6,0)
z=b'';i=8
while i<len(data):
 n=struct.unpack('>I',data[i:i+4])[0];kind=data[i+4:i+8];b=data[i+8:i+8+n];i+=12+n
 if kind==b'IDAT':z+=b
raw=zlib.decompress(z);stride=w*4;rows=[];last=[0]*stride;i=0
for y in range(h):
 f=raw[i];i+=1;row=list(raw[i:i+stride]);i+=stride
 for x in range(stride):
  a=row[x-4] if x>=4 else 0;b=last[x];c=last[x-4] if x>=4 else 0
  if f==1:v=a
  elif f==2:v=b
  elif f==3:v=(a+b)//2
  elif f==4:
   q=a+b-c;pa=abs(q-a);pb=abs(q-b);pc=abs(q-c);v=a if pa<=pb and pa<=pc else b if pb<=pc else c
  else:v=0
  row[x]=(row[x]+v)%256
 rows.append(row);last=row
points=set()
for y,row in enumerate(rows):
 for x in range(39,w):
  r,g,b=row[x*4:x*4+3]
  if g>=80 and g>=r*1.5 and g>=b*1.2:points.add((x,y))
boxes=[]
while points:
 stack=[points.pop()];group=[]
 while stack:
  x,y=stack.pop();group.append((x,y))
  for pt in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
   if pt in points:points.remove(pt);stack.append(pt)
 if len(group)>5:boxes.append([min(x for x,y in group),min(y for x,y in group),max(x for x,y in group),max(y for x,y in group)])
boxes.sort()
notes=json.loads((root/'normalized.json').read_text())['sequences'][0]['notes']
# The screenshot labels C4 at y=170, but the matched MIDI C is 72 (C5 in
# the app). This is an octave-label difference, not a musical transposition.
# Reviewed timeline anchors: x=41 -> t0-e25; x=1475 -> t0-e693.
def nearest(a,b):
 rows=[]
 for box in boxes:
  x,y,x2,y2=box;midi=round((890-(y+y2)/2)/10)
  same=[n for n in notes if n['midi']==midi]
  n=min(same,key=lambda n:abs(x-a-b*n['startSeconds']))
  rows.append((box,n,x-a-b*n['startSeconds']))
 return rows
rows=nearest(-11,20.8)
for _ in range(4):
 xs=[r[1]['startSeconds'] for r in rows];ys=[r[0][0] for r in rows]
 xm=sum(xs)/len(xs);ym=sum(ys)/len(ys)
 b=sum((x-xm)*(y-ym) for x,y in zip(xs,ys))/sum((x-xm)**2 for x in xs)
 a=ym-b*xm;rows=nearest(a,b)
assert len(rows)==175 and len({r[1]['id'] for r in rows})==175
assert max(abs(r[2]) for r in rows)<.6
for box,n,error in rows:
 alternatives=[v for v in notes if v['id']!=n['id'] and v['midi']==n['midi'] and abs(box[0]-a-b*v['startSeconds'])<.75]
 assert not alternatives,(box,n['id'],alternatives)
report={'mapping':{'xIntercept':a,'pixelsPerSecond':b,'yIntercept':890,'pixelsPerSemitone':10},
 'matches':[{'box':box,'sourceId':n['id'],'midi':n['midi'],'xResidual':error} for box,n,error in rows]}
(root/'screenshot-match.json').write_text(json.dumps(report,indent=2)+'\n')
print('Matched 175 unique notes; maximum horizontal residual',max(abs(r[2]) for r in rows),'pixels')
