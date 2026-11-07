"""mujoco 확인: datashader가 구운 '밟힌 횟수' 높이맵을 뒤집어(많이 밟힌 길 = 골짜기) 지형으로 넣고 구슬을 굴린다."""
import sys, numpy as np, mujoco
from PIL import Image, ImageDraw
cnt=np.load(sys.argv[1]); out=sys.argv[2]
# 600x900 → 60x90 로 줄이고(블록 최대), 많이 밟힌 곳을 낮게
H,W=cnt.shape; rows,cols=60,90
blk=cnt[:rows*(H//rows),:cols*(W//cols)].reshape(rows,H//rows,cols,W//cols).max(axis=(1,3))
worn=np.sqrt(blk/max(1,blk.max()))                 # 0~1, 많이 밟힐수록 1
BLUR=float(sys.argv[3]) if len(sys.argv)>3 else 0.0
if BLUR>0:                                          # 가우시안 번짐 = 침식 커널 (골이 넓어져 구슬이 끌림)
    from PIL import ImageFilter
    im=Image.fromarray((worn*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(BLUR)); worn=np.asarray(im,dtype=float)/255.0; worn/=max(1e-9,worn.max())
elev=1.0-worn                                      # 골짜기 = 등뼈
# 가장자리는 벽처럼 높게(구슬이 밖으로 안 떨어지게)
elev[0,:]=elev[-1,:]=elev[:,0]=elev[:,-1]=1.0
RX,RY,EZ=4.5,3.0,0.6                                # 지형 반폭(m), 높이 눈금(m)
xml=f"""<mujoco><option timestep="0.002" gravity="0 0 -9.81"/>
<asset><hfield name="t" nrow="{rows}" ncol="{cols}" size="{RX} {RY} {EZ} 0.1"/></asset>
<worldbody><geom type="hfield" hfield="t" friction="0.6 0.005 0.0001"/>
<body name="ball" pos="0 0 2"><freejoint/><geom type="sphere" size="0.06" mass="0.05" friction="0.6 0.005 0.0001"/></body>
</worldbody></mujoco>"""
m=mujoco.MjModel.from_xml_string(xml)
m.hfield_data[:]=elev.astype(np.float32).ravel()   # 행 우선, 첫 행 = y 최소
d=mujoco.MjData(m)
def terrain_h(x,y):   # 구슬 위치의 지형 높이(검산용)
    c=int((x+RX)/(2*RX)*(cols-1)); r=int((y+RY)/(2*RY)*(rows-1)); return elev[min(max(r,0),rows-1),min(max(c,0),cols-1)]*EZ+0.1
rng=np.random.default_rng(261108); results=[]; paths=[]
for k in range(24):
    mujoco.mj_resetData(m,d)
    x,y=rng.uniform(-RX*0.8,RX*0.8),rng.uniform(-RY*0.8,RY*0.8)
    d.qpos[:3]=[x,y,terrain_h(x,y)+0.08]; d.qvel[:]=0
    path=[(x,y)]
    for i in range(3000):                           # 6초
        mujoco.mj_step(m,d)
        if i%100==0: path.append((d.qpos[0],d.qpos[1]))
    xe,ye=d.qpos[0],d.qpos[1]; path.append((xe,ye)); paths.append(path)
    results.append((worn[min(max(int((y+RY)/(2*RY)*(rows-1)),0),rows-1),min(max(int((x+RX)/(2*RX)*(cols-1)),0),cols-1)],
                    worn[min(max(int((ye+RY)/(2*RY)*(rows-1)),0),rows-1),min(max(int((xe+RX)/(2*RX)*(cols-1)),0),cols-1)],
                    float(np.hypot(d.qvel[0],d.qvel[1]))))
res=np.array(results)
print(f"[번짐 {BLUR}] 구슬 24개 · 6초 굴림 · 출발점 '밟힘' 평균 {res[:,0].mean():.2f} → 도착점 '밟힘' 평균 {res[:,1].mean():.2f} (0 = 아무도 안 밟은 곳, 1 = 가장 많이 밟힌 골)")
print(f"도착점 밟힘 ≥ 0.5 인 구슬 {int((res[:,1]>=0.5).sum())}/24 (출발 때는 {int((res[:,0]>=0.5).sum())}/24) · 아직 구르는 중(속도>0.05) {int((res[:,2]>0.05).sum())}")
# 그림: 높이맵 위에 구슬 경로
img=Image.fromarray((255*(1-elev)).astype(np.uint8)[::-1]).resize((cols*10,rows*10),Image.NEAREST).convert("RGB")
dr=ImageDraw.Draw(img)
def px(x,y): return ((x+RX)/(2*RX)*cols*10, (RY-y)/(2*RY)*rows*10)
for path in paths:
    pts=[px(*p) for p in path]; dr.line(pts,fill=(230,70,60),width=2); dr.ellipse([pts[0][0]-4,pts[0][1]-4,pts[0][0]+4,pts[0][1]+4],outline=(120,200,255),width=2); dr.ellipse([pts[-1][0]-4,pts[-1][1]-4,pts[-1][0]+4,pts[-1][1]+4],fill=(255,240,120))
img.save(out); print("saved",out)
