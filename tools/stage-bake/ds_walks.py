"""datashader 확인: 37회차 걸음(3D 위상 조각 좌표)을 2D로 투영해 픽셀별 '밟힌 횟수'로 모양을 그린다."""
import json, sys, math, numpy as np, pandas as pd, datashader as ds, datashader.transfer_functions as tf
from PIL import Image, ImageDraw, ImageFont
FONT=ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 18)
piece=json.load(open(sys.argv[1],encoding="utf-8")); out=sys.argv[2]
N={n["id"]:n for n in piece["nodes"]}
# 3D 좌표: (x, y) = 힘 배치, z = 장부 높이 hz
P3={i:(n["x"], n["y"], n["hz"]) for i,n in N.items()}
def proj(p, az=35, el=35, zk=1.6):
    x,y,z=p; a=math.radians(az); e=math.radians(el)
    X=x*math.cos(a)-y*math.sin(a); Y=(x*math.sin(a)+y*math.cos(a))*math.cos(e)+z*zk*math.sin(e)
    return X,Y
def frame(mode):
    rows=[]
    for r in piece["runSeq"]:
        seq=r["seq"]; al=r["al"]
        for t,i in enumerate(seq):
            x,y,z=P3[i]; X,Y=(x,y) if mode=="top" else proj((x,y,z))
            rows.append((X,Y, (al[t] if al[t] is not None else np.nan), r["n"]))
        rows.append((np.nan,np.nan,np.nan,r["n"]))   # 회차 구분(선 끊기)
    return pd.DataFrame(rows,columns=["x","y","al","run"])
W,H=900,600
imgs=[]; stats=[]
for mode,title in (("top","위에서 본 2D (z 버림) · 픽셀=밟힌 횟수"),("iso","3D→2D 투영(방위 35°·고도 35°) · 픽셀=밟힌 횟수")):
    df=frame(mode)
    cvs=ds.Canvas(plot_width=W,plot_height=H,x_range=(df.x.min()-0.15,df.x.max()+0.15),y_range=(df.y.min()-0.15,df.y.max()+0.15))
    agg=cvs.line(df,"x","y",agg=ds.count())
    a=agg.values; nz=a[a>0]
    stats.append((mode, int((a>0).sum()), int(a.max()), float(np.percentile(nz,50)), float(np.percentile(nz,90))))
    img=tf.shade(tf.spread(agg,px=1), how="eq_hist", cmap=["#101014","#4a5ab0","#f2e8c8"])
    img=tf.set_background(img,"#101014").to_pil(); ImageDraw.Draw(img).text((12,10),title,fill="#f2e8c8",font=FONT); imgs.append(img)
    if mode=="iso":
        np.save(out.replace(".png","_count_iso.npy"), a)              # 높이맵(밟힌 횟수) 배열
        hm=(255*np.sqrt(a/max(1,a.max()))).astype(np.uint8); Image.fromarray(hm[::-1]).save(out.replace(".png","_heightmap_iso.png"))
# 3) 같은 투영, 픽셀=지나간 사람들의 정렬도 평균 (색 = 값)
df=frame("iso"); cvs=ds.Canvas(plot_width=W,plot_height=H,x_range=(df.x.min()-0.15,df.x.max()+0.15),y_range=(df.y.min()-0.15,df.y.max()+0.15))
aggm=cvs.line(df,"x","y",agg=ds.mean("al"))
img=tf.shade(tf.spread(aggm,px=1), how="linear", cmap=["#2b4bd6","#f2e8c8","#d33a2c"], span=(0.35,0.75))
img=tf.set_background(img,"#101014").to_pil(); ImageDraw.Draw(img).text((12,10),"같은 투영 · 픽셀=지나간 사람들의 정렬도 평균 (파랑 0.35 → 빨강 0.75)",fill="#f2e8c8",font=FONT); imgs.append(img)
# 4) 위상 조각을 점구름으로: 실마다 굵기(w)에 비례한 반지름의 관 표면에 점을 뿌려 투영 → 픽셀=점 수
rng=np.random.default_rng(261108); pts=[]
for e in piece["edges"]:
    a=np.array(P3[e["a"]]); b=np.array(P3[e["b"]]); w=e["w"]; r=0.012+0.006*w; n=int(1500*w)
    t=rng.random(n); ang=rng.random(n)*2*np.pi; d=b-a; d/=np.linalg.norm(d)
    u=np.cross(d,[0,0,1]); u=u/np.linalg.norm(u) if np.linalg.norm(u)>1e-6 else np.array([1.0,0,0]); v=np.cross(d,u)
    P=a[None,:]+t[:,None]*(b-a)[None,:]+r*(np.cos(ang)[:,None]*u[None,:]+np.sin(ang)[:,None]*v[None,:])
    pts.append(P)
for i,(x,y,z) in P3.items():   # 방 = 구
    n=6000; v=rng.normal(size=(n,3)); v/=np.linalg.norm(v,axis=1)[:,None]; pts.append(np.array([x,y,z])+0.045*v)
P=np.vstack(pts); XY=np.array([proj(p) for p in P]); dfp=pd.DataFrame({"x":XY[:,0],"y":XY[:,1]})
cvs=ds.Canvas(plot_width=W,plot_height=H,x_range=(df.x.min()-0.15,df.x.max()+0.15),y_range=(df.y.min()-0.15,df.y.max()+0.15))
aggp=cvs.points(dfp,"x","y",agg=ds.count())
img=tf.shade(aggp, how="eq_hist", cmap=["#101014","#3a3f6b","#c9c3a8","#ffffff"]); img=tf.set_background(img,"#101014").to_pil()
ImageDraw.Draw(img).text((12,10),"같은 투영 · 위상 조각을 점구름으로: 관 굵기 = 실을 밟은 사람 수, 픽셀 = 점 수",fill="#f2e8c8",font=FONT); imgs.append(img)
print(f"점구름: 점 {len(P)}개 · 픽셀 최대 {int(aggp.values.max())}")
# 방 번호 표시(그림 밖 보조선 없이 숫자만)
sheet=Image.new("RGB",(W,H*4+8*3),"#101014"); y0=0
for im in imgs: sheet.paste(im,(0,y0)); y0+=H+8
d=ImageDraw.Draw(sheet)
for k,mode in enumerate(("top","iso","iso","iso")):
    df=frame(mode); xr=(df.x.min()-0.15,df.x.max()+0.15); yr=(df.y.min()-0.15,df.y.max()+0.15)
    for i,n in N.items():
        x,y,z=P3[i]; X,Y=(x,y) if mode=="top" else proj((x,y,z))
        px=(X-xr[0])/(xr[1]-xr[0])*W; py=H-(Y-yr[0])/(yr[1]-yr[0])*H
        d.text((px+5,k*(H+8)+py-8),str(i),fill="#9ad08a",font=FONT)
sheet.save(out); print("saved",out)
for m,npx,mx,p50,p90 in stats: print(f"{m}: 밟힌 픽셀 {npx} · 최대 횟수 {mx} · 밟힌 픽셀 중앙값 {p50:.0f} · 90% {p90:.0f}")
