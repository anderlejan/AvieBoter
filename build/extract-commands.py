import re,sys,json,glob,os
out=[]
for f in sorted(glob.glob(sys.argv[1]+"/Commands/*.cs")):
    mod=os.path.basename(f)[:-3]
    attrs=[]
    for line in open(f,encoding='utf-8-sig'):
        s=line.strip()
        if s.startswith('['): attrs.append(s); continue
        m=re.match(r'public\s+object\s+(\w+)\s*\(([^)]*)\)',s)
        if m and any(a.startswith('[About(') for a in attrs):
            A=' '.join(attrs)
            about=re.search(r'\[About\("((?:[^"\\]|\\.)*)"',A).group(1)
            t=re.search(r'\[CmdType(Get|Set|Do)',A)
            hints=[re.findall(r'"((?:[^"\\]|\\.)*)"',a) for a in attrs if a.startswith('[ArgHints(')]
            out.append(dict(module=mod,name=m.group(1),type=t.group(1) if t else "?",about=about,
              params=[p.strip().split()[-1] for p in m.group(2).split(',') if p.strip()],argHints=hints))
        if s and not s.startswith('[') and not s.startswith('//'): attrs=[]
# upstream examples may hold e-mail addresses: show a neutral placeholder instead
def neutral(v):
    if isinstance(v,str): return re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}','name@example.com',v)
    if isinstance(v,list): return [neutral(x) for x in v]
    if isinstance(v,dict): return {k:neutral(x) for k,x in v.items()}
    return v
out=neutral(out)
json.dump(out,open(sys.argv[2],'w'),indent=1); print(len(out))
