import sys, glob, os, re
def tk(t): return ''.join(ch for ch in t if ch.isalnum()).lower()
out=[]; n=0
for f in sorted(glob.glob('' + os.path.dirname(os.path.abspath(__file__)) + '/*.txt')):
    tag=os.path.basename(f)[:-4]
    if len(sys.argv)>2 and tag not in sys.argv[2:]: continue
    for l in open(f):
        l=l.rstrip('\n')
        if not l: continue
        t,c=l.rsplit('|',1)
        out.append(f"{tag}|{tk(t)}|{c}"); n+=len(c.split(','))
payload=';'.join(out).replace("'","''")
parsed=f"""with r as (select split_part(x,'|',1) tag, split_part(x,'|',2) k, unnest(string_to_array(split_part(x,'|',3),',')) ch from unnest(string_to_array('{payload}',';')) x),
p as (select tag, k, left(ch,1) m, substr(ch,2)::int l from r)"""
if sys.argv[1]=='check':
    print(parsed+"""
select p.tag, p.k, p.m, p.l, (select count(*) from songs s where s.title_key=p.k) songs from p
 where not exists (select 1 from songs s join charts c on c.song_id=s.id and c.version='phoenix2' and c.mode=p.m and c.level=p.l where s.title_key=p.k);""")
else:
    print(parsed+""",
ins as (insert into public.chart_tags_ref (chart_id, tag)
  select distinct c.id, p.tag from p join public.songs s on s.title_key = p.k
    join public.charts c on c.song_id = s.id and c.mode = p.m and c.level = p.l and c.version in ('phoenix2', 'phoenix')
  on conflict do nothing returning 1)
select (select count(*) from ins) inserted, (select jsonb_agg(p.tag||' '||p.k||' '||p.m||p.l) from p
 where not exists (select 1 from songs s join charts c on c.song_id=s.id and c.version='phoenix2' and c.mode=p.m and c.level=p.l where s.title_key=p.k)) unmatched;""")
print(n, file=sys.stderr)
