"""Builds src/evidence/fixtures/paper-*.pdf: three FICTIONAL two-column research papers for tests.

Every number and finding is made up. Run: python3 scripts/make-paper-fixtures.py (needs reportlab).
"""
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit

W, H = letter
COL_W = 240
LEFT, RIGHT = 54, 318

PAPERS = [
    dict(
        file="paper-walking-rct.pdf",
        title="A Daily Walking Program and Glycemic Control in Adults With Type 2 Diabetes: A Randomized Trial",
        authors="Maria Delgado, Kevin Osei, Hannah Park, Luis Romero",
        venue="Journal of Fictional Clinical Studies. 2025;12(3):101-110",
        doi="10.5555/jfcs.2025.0101",
        abstract=("Background: Walking is widely recommended, but trial evidence on glycemic control is limited. Methods: We randomly assigned "
                  "412 adults with type 2 diabetes to a 12-week daily walking program or usual care. Results: HbA1c fell by 0.6 percentage "
                  "points in the walking group compared with 0.1 in usual care (difference 0.5; 95% CI 0.3 to 0.7; p<0.001). Conclusions: "
                  "A structured walking program improved glycemic control over 12 weeks."),
        body=[
            ("Methods", "This randomized controlled trial enrolled 412 adults aged 40 to 75 years at four community clinics. Participants were assigned "
             "in a 1:1 ratio to a daily walking program of 30 minutes, supported by weekly coaching calls, or to usual care. The primary outcome was the "
             "change in HbA1c at 12 weeks. Secondary outcomes included body weight and adherence, measured with step counters."),
            ("Results", "Of the 412 participants, 389 completed follow-up. HbA1c fell by 0.6 percentage points in the walking group compared with 0.1 "
             "in usual care (difference 0.5; 95% CI 0.3 to 0.7; p<0.001). Mean weight loss was 1.8 kg in the walking group and 0.4 kg in usual care. "
             "Adherence was high: participants walked a median of 5.6 days per week. No serious adverse events were attributed to the program."),
            ("Discussion", "A simple, coached walking program produced a clinically meaningful reduction in HbA1c within 12 weeks. The effect is "
             "comparable to adding a second oral medication in some studies. Coaching calls may explain the high adherence we observed."),
            ("Limitations", "Follow-up lasted only 12 weeks, so we cannot say whether the benefit persists. Participants were volunteers and may have "
             "been more motivated than typical patients. Outcome assessors were not blinded to group assignment."),
        ],
    ),
    dict(
        file="paper-walking-cohort.pdf",
        title="Steps per Day and Long-Term HbA1c in a Primary Care Cohort",
        authors="Samuel Chen, Aisha Bello, Robert Lindqvist",
        venue="Fictional Diabetes Research. 2024;7(2):55-63",
        doi="10.5555/fdr.2024.0055",
        abstract=("Background: Few studies follow activity and glycemic control for more than a year. Methods: We followed 2,850 adults with type 2 "
                  "diabetes for 3 years. Results: Each additional 1,000 daily steps was associated with an HbA1c 0.08 percentage points lower "
                  "(95% CI 0.05 to 0.11). Conclusions: Higher daily step counts were associated with modestly better long-term control."),
        body=[
            ("Methods", "We conducted a retrospective cohort study of 2,850 adults with type 2 diabetes in a regional primary care network. Daily "
             "steps were recorded by a wearable device for at least 30 days at baseline. HbA1c was measured as part of routine care over 3 years. "
             "Models adjusted for age, sex, body mass index and medication changes."),
            ("Results", "Median daily steps were 5,400. Each additional 1,000 daily steps was associated with an HbA1c 0.08 percentage points lower "
             "(95% CI 0.05 to 0.11) over 3 years. The association was weaker in adults older than 70 years. Benefits appeared to level off above "
             "9,000 steps per day."),
            ("Discussion", "In routine care, more walking went with modestly better glycemic control over several years. Because this was an "
             "observational study, people who walk more may differ in other ways that affect their diabetes."),
            ("Limitations", "Step counts were measured only at baseline. Unmeasured confounding, such as diet, may explain part of the association. "
             "The cohort came from one region."),
        ],
    ),
    dict(
        file="paper-walking-null.pdf",
        title="Pedometer Feedback Alone Did Not Improve HbA1c in Older Adults: A Pilot Trial",
        authors="Grace Whitfield, Omar Haddad",
        venue="Fictional Journal of Aging and Health. 2025;3(1):12-19",
        doi="10.5555/fjah.2025.0012",
        abstract=("Background: Pedometers are cheap, but feedback alone may not change behavior. Methods: We randomly assigned 96 adults aged 70 "
                  "and older to pedometer feedback or usual care for 16 weeks. Results: HbA1c changed by -0.1 and 0.0 percentage points "
                  "(difference 0.1; 95% CI -0.2 to 0.4; p=0.48). Conclusions: Feedback without coaching did not improve control."),
        body=[
            ("Methods", "This pilot randomized trial enrolled 96 adults aged 70 years and older with type 2 diabetes. The intervention group received a "
             "pedometer with weekly step-count feedback by text message, without coaching. The primary outcome was the change in HbA1c at 16 weeks."),
            ("Results", "Daily steps rose by 600 in the feedback group but returned near baseline by week 12. HbA1c changed by -0.1 percentage points "
             "with feedback and 0.0 with usual care (difference 0.1; 95% CI -0.2 to 0.4; p=0.48)."),
            ("Discussion", "Feedback alone did not sustain walking or improve HbA1c in older adults. Programs that add coaching or social support may "
             "be needed for this group."),
            ("Limitations", "The trial was small and not powered to detect modest effects. Most participants were women, which limits generality."),
        ],
    ),
]


def write_column(c, x, y, text, font="Helvetica", size=9.5, leading=12.5):
    for line in simpleSplit(text, font, size, COL_W):
        if y < 72:
            return None, line
        c.setFont(font, size)
        c.drawString(x, y, line)
        y -= leading
    return y, None


for p in PAPERS:
    c = canvas.Canvas(f"src/evidence/fixtures/{p['file']}", pagesize=letter)
    c.setTitle(p["title"])
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(LEFT, H - 36, "FICTIONAL TEST PAPER: all data are made up for software testing.")
    y = H - 64
    c.setFont("Helvetica-Bold", 14)
    for line in simpleSplit(p["title"], "Helvetica-Bold", 14, W - 2 * LEFT):
        c.drawString(LEFT, y, line); y -= 18
    c.setFont("Helvetica", 10); c.drawString(LEFT, y, p["authors"]); y -= 14
    c.setFont("Helvetica-Oblique", 9); c.drawString(LEFT, y, p["venue"] + "   doi:" + p["doi"]); y -= 20
    c.setFont("Helvetica", 9.5)
    for line in simpleSplit("Abstract. " + p["abstract"], "Helvetica", 9.5, W - 2 * LEFT):
        c.drawString(LEFT, y, line); y -= 12.5
    y -= 10
    # Two columns: sections flow down the left column, then the right, then onto page 2.
    cols = [(LEFT, y), (RIGHT, y)]
    col = 0
    cx, cy = cols[0]
    for heading, text in p["body"]:
        for chunk_font, chunk, size in [("Helvetica-Bold", heading, 10.5), ("Helvetica", text, 9.5)]:
            remaining = chunk
            while remaining:
                lines = simpleSplit(remaining, chunk_font, size, COL_W)
                written = 0
                for line in lines:
                    if cy < 72:
                        break
                    c.setFont(chunk_font, size); c.drawString(cx, cy, line); cy -= 12.5; written += 1
                remaining = " ".join(lines[written:])
                if remaining:
                    col += 1
                    if col == 2:
                        c.showPage(); col = 0; cols = [(LEFT, H - 60), (RIGHT, H - 60)]
                    cx, cy = cols[col]
        cy -= 6
    c.showPage()
    c.setFont("Helvetica-Bold", 10.5); c.drawString(LEFT, H - 60, "References")
    c.setFont("Helvetica", 9)
    for k in range(1, 9):
        c.drawString(LEFT, H - 60 - k * 13, f"{k}. Author A, Author B. An earlier fictional study number {k}. Fictional Journal. 2020;{k}:1-10.")
    c.save()
print("wrote src/evidence/fixtures/paper-*.pdf")
