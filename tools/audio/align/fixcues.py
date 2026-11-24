# Keeps the phrase cues consistent with the final verse table: a cue must lie inside its own verse,
# and every verse (and basmala) has a cue at its start.
import json,re,sys
T='/tmp/claude-0/-home-claude/c27621a0-70e3-5ace-adb4-287ba42129f8/scratchpad/'
F=json.load(open(T+'minsh/files.json'));tot=0
for f,v in F.items():
    p=T+'minsh/'+v['aa'];c=json.load(open(p))
    ks=[k for k in c if k not in('END','CUES') and c[k]];ks.sort(key=lambda k:c[k][1])
    span={k:(c[k][1],c[ks[i+1]][1] if i+1<len(ks) else c['END']) for i,k in enumerate(ks)}
    cues=[q for q in c['CUES'] if q[1] in span and span[q[1]][0]-0.05<=q[0]<span[q[1]][1]-0.05]
    have={q[1] for q in cues if abs(q[0]-span[q[1]][0])<0.06}
    for k in ks:
        if k not in have and c[k][2]!='nopause': cues.append([c[k][1],k,0])
        elif k not in have: cues.append([c[k][1],k,0])
    # word index must not go backwards inside a verse
    cues.sort(key=lambda q:(q[0],0 if q[2]==0 else 1));out=[];last={}
    for q in cues:
        if q[1] in last and q[2]<=last[q[1]]: continue
        last[q[1]]=q[2];out.append(q)
    tot+=len(c['CUES'])-len(out);c['CUES']=out;json.dump(c,open(p,'w'))
    print(f,len(out))
