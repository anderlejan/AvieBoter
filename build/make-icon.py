from PIL import Image, ImageDraw
import sys
def draw(sz):
    s=sz*4
    im=Image.new('RGBA',(s,s),(0,0,0,0)); d=ImageDraw.Draw(im)
    r=int(s*0.2)
    d.rounded_rectangle([int(s*.04),int(s*.04),int(s*.96),int(s*.96)],r,fill=(31,98,166,255),outline=(255,255,255,255),width=max(2,s//28))
    # robot head
    d.rounded_rectangle([int(s*.22),int(s*.30),int(s*.78),int(s*.74)],int(s*.10),fill=(234,242,250,255))
    d.line([int(s*.5),int(s*.30),int(s*.5),int(s*.17)],fill=(234,242,250,255),width=max(2,s//18))
    d.ellipse([int(s*.44),int(s*.11),int(s*.56),int(s*.23)],fill=(255,200,80,255))
    for cx in (.37,.63):
        d.ellipse([int(s*(cx-.07)),int(s*.42),int(s*(cx+.07)),int(s*.56)],fill=(31,98,166,255))
    d.rounded_rectangle([int(s*.36),int(s*.62),int(s*.64),int(s*.67)],int(s*.02),fill=(31,98,166,255))
    return im.resize((sz,sz),Image.LANCZOS)
sizes=[16,20,24,32,40,48,64,128,256]
big=draw(256)
big.save(sys.argv[1],format='ICO',sizes=[(x,x) for x in sizes],append_images=[draw(x) for x in sizes[:-1]])
big.save(sys.argv[2])
