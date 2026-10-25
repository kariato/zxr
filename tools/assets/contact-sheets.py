"""Make compact front/back review sheets from actual Blender renders."""
from pathlib import Path
import json
import math
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT/'out/asset-production/reference-verification'
rows = json.loads((REPORT/'manifest.json').read_text())['assets']
font_path = '/System/Library/Fonts/Supplemental/Arial.ttf'
font = ImageFont.truetype(font_path, 16) if Path(font_path).exists() else ImageFont.load_default()
for start in range(0, len(rows), 20):
    group = rows[start:start+20]
    columns, cell_width, cell_height = 4, 400, 235
    sheet = Image.new('RGB', (columns*cell_width, math.ceil(len(group)/columns)*cell_height+48), '#152128')
    draw = ImageDraw.Draw(sheet)
    draw.text((16, 12), f'GLB verification: front / back — assets {start+1}–{start+len(group)}', font=font, fill='#e0eeee')
    for index, row in enumerate(group):
        xx, yy = (index%columns)*cell_width, 48+(index//columns)*cell_height
        draw.text((xx+10, yy+4), row['identity'], font=font, fill='#f4d69d')
        for column, view in enumerate(['front', 'back']):
            path = REPORT/'renders'/f'{row["id"]}-{view}.png'
            if not path.exists():
                draw.text((xx+10+column*200, yy+100), 'Pending', font=font, fill='#bbbbbb')
                continue
            picture = Image.open(path).convert('RGB')
            picture.thumbnail((196, 196))
            sheet.paste(picture, (xx+column*200+(200-picture.width)//2, yy+30))
    sheet.save(REPORT/f'contact-sheet-{start//20+1}.jpg', quality=92)
print(f'Wrote {math.ceil(len(rows)/20)} review sheets')
