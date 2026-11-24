#!/bin/bash
# usage: chunkasr.sh <id> <silence file>   -> ch<id>/NNNN.json
n=$1; sil=$2; S=/tmp/claude-0/-home-claude/c27621a0-70e3-5ace-adb4-287ba42129f8/scratchpad/minsh
cd $S; rm -rf ch$n; mkdir ch$n
ffmpeg -hide_banner -loglevel error -y -i p$n.mp3 -ac 1 -ar 16000 -c:a pcm_s16le ch$n/full.wav
python3 - "$n" "$sil" <<'PY'
import sys,re,wave,json
n,sil=sys.argv[1:3]
w=wave.open('ch%s/full.wav'%n);sr=w.getframerate();N=w.getnframes();dur=N/sr
v=[float(x) for x in re.findall(r'silence_(?:start|end): ([0-9.]+)',open(sil).read())]
st=[0.0]+v[1::2];en=v[0::2]+[dur]
ch=[(s,e) for s,e in zip(st,en) if e-s>0.35]
json.dump(ch,open('ch%s/chunks.json'%n,'w'))
for i,(s,e) in enumerate(ch):
    a=max(0,s-0.2);b=min(dur,e+0.2)
    w.setpos(int(a*sr));d=w.readframes(int((b-a)*sr))
    o=wave.open('ch%s/%04d.wav'%(n,i),'wb');o.setnchannels(1);o.setsampwidth(2);o.setframerate(sr);o.writeframes(d);o.close()
print(n,'chunks',len(ch))
PY
rm ch$n/full.wav
cd ch$n && /home/claude/ggml-org/whisper.cpp/build/bin/whisper-cli -m /home/claude/models/ggml-tiny.bin -l ar -t 1 -np -nt -oj -mc 0 $(ls [0-9]*.wav | sed 's/^/-f /') > /dev/null 2>&1
rm -f [0-9]*.wav; echo "done $n $(ls *.wav.json 2>/dev/null | wc -l)"
