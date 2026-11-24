import json,re,sys
from difflib import SequenceMatcher
T='/tmp/claude-0/-home-claude/c27621a0-70e3-5ace-adb4-287ba42129f8/scratchpad/'
def norm(w):
    w=re.sub('[ً-ْٰـۖ-ۭ]','',w)
    w=re.sub('[أإآٱ]','ا',w).replace('ى','ي').replace('ة','ه').replace('ؤ','و').replace('ئ','ي').replace('ء','')
    return re.sub('[^ء-ي]','',w)
js=open(T+'tanzil/quran-data.js').read()
cnt={i+1:int(c) for i,c in enumerate(re.findall(r'\[\d+, (\d+), \d+, \d+, \'',js)[:114])}
text={};BASM='بسم الله الرحمن الرحيم '
for l in open(T+'tanzil/quran-simple-clean.txt',encoding='utf8'):
    q=l.rstrip('\n').split('|')
    if len(q)==3:
        s,a=int(q[0]),int(q[1]);t=q[2]
        if a==1 and s!=1 and t.startswith(BASM): t=t[len(BASM):]
        text[(s,a)]=t
nxt=lambda s,a:(s,a+1) if a<cnt[s] else (s+1,1)
sim=lambda x,y:1.0 if x==y else SequenceMatcher(None,x,y).ratio()
def run(d,a,b):
    ch=json.load(open(d+'/chunks.json'))
    H=[]
    for i in range(len(ch)):
        try: tx=''.join(s['text'] for s in json.load(open(d+'/%04d.wav.json'%i))['transcription'])
        except Exception: tx=''
        for w in tx.split():
            if norm(w): H.append((norm(w),i))
    R=[]
    for w in 'اعوذ بالله من الشيطان الرجيم'.split(): R.append((norm(w),('pre',0),0))
    sa=a
    while True:
        if sa[1]==1 and sa[0]!=1:
            for i,w in enumerate(BASM.split()): R.append((norm(w),('bas',sa[0]),i))
        j=0
        for w in text[sa].split():
            if norm(w): R.append((norm(w),sa,j));j+=1
        if sa==b: break
        sa=nxt(*sa)
    n,m=len(H),len(R);BAND=max(250,abs(n-m)+250);NEG=-1e9
    S=[dict() for _ in range(n+1)];BK=[dict() for _ in range(n+1)];S[0][0]=0.0
    for j in range(1,min(m,BAND)+1): S[0][j]=S[0][j-1]-0.15
    for i in range(1,n+1):
        c=int(i*m/n);Si=S[i];Sp=S[i-1];hw=H[i-1][0]
        for j in range(max(0,c-BAND),min(m,c+BAND)+1):
            best=NEG;bk=0
            v=Sp.get(j)
            if v is not None and v-0.45>best: best=v-0.45;bk=1
            if j>0:
                v=Si.get(j-1)
                if v is not None and v-0.45>best: best=v-0.45;bk=2
                v=Sp.get(j-1)
                if v is not None:
                    sc=v+(sim(hw,R[j-1][0])-0.55)*2.2
                    if sc>best: best=sc;bk=3
            if best>NEG: Si[j]=best;BK[i][j]=bk
    j=max(S[n],key=lambda k:S[n][k]);i=n;pairs=[]
    while i>0 or j>0:
        bk=BK[i].get(j,2 if i==0 else 1)
        if bk==3: pairs.append((i-1,j-1));i-=1;j-=1
        elif bk==1: i-=1
        else: j-=1
    pairs.reverse()
    good=[(i,j) for i,j in pairs if sim(H[i][0],R[j][0])>=0.6]
    keys=[];size={}
    for w,k,idx in R:
        if k not in keys: keys.append(k)
        size[k]=size.get(k,0)+1
    by={}
    for i,j in good: by.setdefault(R[j][1],[]).append((R[j][2],i,H[i][1]))
    out={};prev=None;dur=ch[-1][1]
    mid=lambda b:round((ch[b-1][1]+ch[b][0])/2,2) if b>0 else round(max(0,ch[0][0]-0.6),2)
    for k in keys:
        ms=by.get(k)
        if not ms: out[k]=None;continue
        idx,hi,c=min(ms)
        if prev is None:
            b=c if idx==0 else max(0,c-1) if idx>3 else c
            out[k]=(mid(b),round(ch[b][0],2),'ok' if idx==0 else 'late%d'%idx)
        else:
            pidx,phi,pc=max(by[prev]);tail=size[prev]-1-pidx
            if c==pc:
                words=[x for x in range(len(H)) if H[x][1]==c]
                pos=(hi-idx-words[0])/max(1,len(words));pos=min(max(pos,0.05),0.95)
                t=round(ch[c][0]+(ch[c][1]-ch[c][0])*pos,2);out[k]=(t,t,'nopause')
            else:
                if idx==0: b=c;q='ok'
                elif tail==0: b=pc+1;q='ok'
                elif c==pc+1: b=c;q='ok'
                else:
                    best=None
                    for bb in range(pc+1,c+1):
                        wb=sum(1 for x in range(phi+1,hi) if H[x][1]<bb);wa=sum(1 for x in range(phi+1,hi) if H[x][1]>=bb)
                        sc=abs(wb-tail)+abs(wa-idx)
                        if best is None or sc<best[0]: best=(sc,bb)
                    b=best[1];q='amb'
                out[k]=(mid(b),round(ch[b][0],2),q)
        prev=k
    # verses with no recognised word (usually one or two words long): place them on the speech chunks
    # that lie between the neighbouring verses
    import bisect
    starts=[c[0] for c in ch]
    cidx=lambda t:max(0,bisect.bisect_right(starts,t+0.01)-1)
    wcount=[0]*len(ch)
    for w,c in H: wcount[c]+=1
    i=0
    while i<len(keys):
        if out.get(keys[i]) is not None or keys[i][0]=='pre': i+=1;continue
        j=i
        while j<len(keys) and out.get(keys[j]) is None: j+=1
        rn=keys[i:j]
        P=next((keys[x] for x in range(i-1,-1,-1) if out.get(keys[x])),None)
        N=keys[j] if j<len(keys) else None
        pcP=max(by[P])[2] if P else -1
        cN=cidx(out[N][1]) if N and out[N][2]!='nopause' else (cidx(out[N][1]) if N else len(ch))
        free=list(range(pcP+1,cN))
        if len(free)>=len(rn) and len(rn)>0:
            # extra chunks go to whichever verse has the most words left to place
            need=[size[k] for k in rn];groups=[[] for _ in rn];gi=0
            for n_,c in enumerate(free):
                left=len(free)-n_
                if gi<len(rn)-1 and groups[gi] and (sum(wcount[x] for x in groups[gi])>=need[gi] or left<=len(rn)-1-gi): gi+=1
                groups[gi].append(c)
            if all(groups):
                for k,g in zip(rn,groups): out[k]=(mid(g[0]),round(ch[g[0]][0],2),'ok' if len(free)==len(rn) else 'amb');by[k]=[(size[k]-1,-1,g[-1])]
        i=j
    prev=[k for k in keys if out.get(k)][-1]
    lk=prev;pidx,phi,pc=max(by[lk]);tail=size[lk]-1-pidx
    lc=pc
    # closing formula «صدق الله العظيم» is not part of the recitation
    end=None
    for cc in range(pc+1,len(ch)):
        ws=[H[x][0] for x in range(len(H)) if H[x][1]==cc]
        if any(sim(w,'صدق')>=0.75 for w in ws[:2]) and len(ws)<=5: end=round((ch[cc-1][1]+ch[cc][0])/2,2);break
    if end is None:
        nx=pc+1 if tail==0 else len(ch)
        end=round((ch[nx-1][1]+ch[nx][0])/2,2) if nx<len(ch) else round(dur,2)
    # phrase cues: the first reference word heard in each speech chunk
    cues=[];seen=-1
    first={}
    for i,j in good:
        c=H[i][1]
        if c not in first: first[c]=j
    for c in sorted(first):
        j=first[c]
        if j<=seen: continue
        seen=j;w,k,idx=R[j]
        # snap a chunk that opens a verse to word 0
        if k in out and out[k] and abs(out[k][1]-ch[c][0])<0.05: idx=0
        cues.append([round(ch[c][0],2),k,idx])
    run.cues=cues;run.size=size
    return out,keys,end,len(good)/m,(n,m)
if __name__=='__main__':
    d,spec,outf=sys.argv[1:4];a,b=json.loads(spec)
    out,keys,end,acc,nm=run(d,tuple(a),tuple(b))
    res={'END':end}
    for k in keys: res[('%d:%d'%k) if isinstance(k[0],int) else k[0]+str(k[1])]=out[k]
    res['CUES']=[[t,(('%d:%d'%k) if isinstance(k[0],int) else k[0]+str(k[1])),i] for t,k,i in run.cues]
    json.dump(res,open(outf,'w'))
    bad=[(k,v) for k,v in res.items() if k not in('END','CUES') and (v is None or v[2]!='ok')]
    print(d,'words',nm,'matched %.0f%%'%(acc*100),'verses',len(res)-2,'flagged',len(bad),'END',end,file=sys.stderr)
    for k,v in bad: print('  ',k,v,file=sys.stderr)
