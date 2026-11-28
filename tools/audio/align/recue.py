# A cue used to carry the index of the first *recognised* word of its speech chunk; when the recogniser missed the
# chunk's first word(s) the phrase mark started late. This moves each cue back to the chunk's real first word and,
# when that lands one word beside a pause mark of the mushaf, onto the mark.
import json,re,bisect
from difflib import SequenceMatcher
T='/tmp/claude-0/-home-claude/c27621a0-70e3-5ace-adb4-287ba42129f8/scratchpad/'
def norm(w):
    w=re.sub('[ً-ْٰـۖ-ۭ]','',w)
    w=re.sub('[أإآٱ]','ا',w).replace('ى','ي').replace('ة','ه').replace('ؤ','و').replace('ئ','ي').replace('ء','')
    return re.sub('[^ء-ي]','',w)
sim=lambda x,y:1.0 if x==y else SequenceMatcher(None,x,y).ratio()
BASM='بسم الله الرحمن الرحيم '
W={};MK={}
for l in open(T+'tanzil/quran-simple-clean.txt',encoding='utf8'):
    q=l.rstrip('\n').split('|')
    if len(q)!=3: continue
    s,a=int(q[0]),int(q[1]);t=q[2]
    if a==1 and s!=1 and t.startswith(BASM): t=t[len(BASM):]
    ws=[];marks=set()
    for tok in t.split():
        if norm(tok): ws.append(norm(tok))
        elif ws: marks.add(len(ws))        # a pause mark after word number len(ws): a phrase may start at this index
    W['%d:%d'%(s,a)]=ws;MK['%d:%d'%(s,a)]=marks
F=json.load(open(T+'minsh/files.json'));moved=0;snapped=0;total=0
for f,v in F.items():
    p=T+'minsh/'+v['aa'];c=json.load(open(p));n=f[1:]
    ch=json.load(open(T+'minsh/ch%s/chunks.json'%n));starts=[x[0] for x in ch]
    def hyp(i):
        try: tx=''.join(s['text'] for s in json.load(open(T+'minsh/ch%s/%04d.wav.json'%(n,i)))['transcription'])
        except Exception: tx=''
        return [norm(w) for w in tx.split() if norm(w)]
    last={}
    for q in c['CUES']:
        t,k,idx=q;total+=1
        if k not in W or idx==0: last[k]=max(last.get(k,-1),idx);continue
        ci=bisect.bisect_right(starts,t+0.05)-1
        if ci<0 or abs(starts[ci]-t)>0.1: last[k]=idx;continue
        h=hyp(ci);ref=W[k];lead=0
        if idx<len(ref):
            for pos,w in enumerate(h[:8]):
                if sim(w,ref[idx])>=0.6: lead=pos;break
        new=max(idx-lead,last.get(k,-1)+1,1)
        m=MK[k]
        if new not in m:
            for d in (1,-1):
                if new+d in m and new+d>last.get(k,-1) and 0<new+d<len(ref): new+=d;snapped+=1;break
        if new!=idx: moved+=1
        q[2]=new;last[k]=new
    json.dump(c,open(p,'w'))
print('cues',total,'moved',moved,'of which snapped to a pause mark',snapped)
