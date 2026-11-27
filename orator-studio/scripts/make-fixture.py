"""Builds src/import/fixtures/sample.pptx for the OratorStudio importer, a small deck that exercises the importer.

Run: python3 scripts/make-fixture.py   (needs python-pptx and Pillow)
"""
import io
from copy import deepcopy
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.util import Inches, Pt
from PIL import Image
from lxml import etree

prs = Presentation()
title_only, title_content, blank, title_slide = prs.slide_layouts[5], prs.slide_layouts[1], prs.slide_layouts[6], prs.slide_layouts[0]

# 1. Title slide
s = prs.slides.add_slide(title_slide)
s.shapes.title.text = "Enrollment Update"
s.placeholders[1].text = "Board of Trustees, Fall 2026"

# 2. Bullets with levels and speaker notes
s = prs.slides.add_slide(title_content)
s.shapes.title.text = "Applications are up in every school"
tf = s.placeholders[1].text_frame
tf.text = "Nursing leads growth"
for text, level in [("Strong transfer pipeline", 1), ("Dentistry steady", 0), ("Public health recovering", 0)]:
    p = tf.add_paragraph(); p.text = text; p.level = level
s.notes_slide.notes_text_frame.text = "Mention the transfer agreement signed in March."

# 3. Table
s = prs.slides.add_slide(title_only)
s.shapes.title.text = "Retention by cohort"
rows = [("Cohort", "Retained"), ("2023", "81%"), ("2024", "86%")]
tbl = s.shapes.add_table(3, 2, Inches(1), Inches(2), Inches(6), Inches(1.5)).table
for r, row in enumerate(rows):
    for c, val in enumerate(row):
        tbl.cell(r, c).text = val

# 4. Picture with alt text, plus a caption text box
s = prs.slides.add_slide(title_only)
s.shapes.title.text = "The new simulation lab"
buf = io.BytesIO(); Image.new("RGB", (40, 30), (0, 81, 149)).save(buf, "PNG"); buf.seek(0)
pic = s.shapes.add_picture(buf, Inches(1), Inches(2), Inches(4))
pic._element.nvPicPr.cNvPr.set("descr", "Students at simulation lab workstations")
tb = s.shapes.add_textbox(Inches(5.5), Inches(2), Inches(3), Inches(1))
tb.text_frame.text = "Opened in August"

# 5. Bar chart
s = prs.slides.add_slide(title_only)
s.shapes.title.text = "Applications by year"
cd = CategoryChartData(); cd.categories = ["2024", "2025", "2026"]
cd.add_series("Nursing", (410, 455, 520)); cd.add_series("Dentistry", (300, 310, 305))
s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(1), Inches(2), Inches(7), Inches(4), cd)

# 6. No title, a group with text, a pie chart (unsupported) and an unknown graphic frame
s = prs.slides.add_slide(blank)
grp = s.shapes.add_group_shape()
g1 = grp.shapes.add_textbox(Inches(1), Inches(1), Inches(6), Inches(1)); g1.text_frame.text = "Questions we expect from the board"
cd = CategoryChartData(); cd.categories = ["A", "B"]; cd.add_series("Share", (60, 40))
s.shapes.add_chart(XL_CHART_TYPE.PIE, Inches(1), Inches(3), Inches(4), Inches(3), cd)
frame = etree.fromstring(
    '<p:graphicFrame xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" '
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">'
    '<p:nvGraphicFramePr><p:cNvPr id="99" name="Diagram 1"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>'
    '<p:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></p:xfrm>'
    '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:graphic>'
    '</p:graphicFrame>'
)
s.shapes._spTree.append(frame)

prs.save("src/import/fixtures/sample.pptx")
print("wrote src/import/fixtures/sample.pptx")
