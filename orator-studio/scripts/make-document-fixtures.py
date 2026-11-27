"""Builds src/documents/fixtures/report-*.pdf: three made-up monthly reports for the document importer tests.

Run: python3 scripts/make-document-fixtures.py   (needs reportlab)
"""
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

MONTHS = [
    ("January", "01/31/26", {"Previous balance": "$1,200.00", "Purchases": "+$512.30", "Payments": "-$800.00", "Credits": "-$0.00"}, "$912.30", None, "1,234", "87.5%", "(120.50)"),
    ("February", "02/28/26", {"Previous balance": "$912.30", "Purchases": "+$1,048.10", "Payments": "-$912.30", "Credits": "-$25.00"}, "$1,023.10", "$41.20", "1,250", "88.0%", "(80.00)"),
    ("March", "03/31/26", {"Previous balance": "$1,023.10", "Purchases": "+$730.00", "Payments": "-$1,023.10", "Credits": "-$0.00"}, "$730.00", "$56.40", "1,262", "88.4%", "45.25"),
]

for month, date, summary, new_balance, cash_back, enrolled, retention, net in MONTHS:
    c = canvas.Canvas(f"src/documents/fixtures/report-{month}2026.pdf", pagesize=letter)
    c.setTitle(f"Monthly report, {month} 2026")
    c.setFont("Helvetica-Bold", 16); c.drawString(54, 740, f"{month.upper()} REPORT")
    c.setFont("Helvetica", 10)
    # Left column: prose that contains numbers which are not figures.
    c.drawString(54, 700, "Questions? Call 1-800-555-0100 between 8 and 5.")
    c.drawString(54, 686, "Late fees of up to $41 may apply if payment is late.")
    c.drawString(54, 672, f"Report date: {date}")
    c.drawString(54, 658, "Fiscal year 2026")
    # Right column: the account summary, label and value in separate columns.
    c.setFont("Helvetica-Bold", 11); c.drawString(330, 700, "Account Summary")
    c.setFont("Helvetica", 10)
    y = 684
    for label, value in summary.items():
        c.drawString(330, y, label); c.drawRightString(560, y, value); y -= 14
    c.drawString(330, y, f"New balance as of {date}:"); c.drawRightString(560, y, new_balance); y -= 14
    if cash_back:
        c.drawString(330, y, "Cash back earned"); c.drawRightString(560, y, cash_back); y -= 14
    if month == "March":
        c.drawString(330, y, "Purchases"); c.drawRightString(560, y, "+$99.99"); y -= 14  # a second, different value
    c.showPage()
    c.setFont("Helvetica-Bold", 14); c.drawString(54, 740, "Program indicators")
    c.setFont("Helvetica", 10)
    c.drawString(54, 712, "Students enrolled .........."); c.drawRightString(300, 712, enrolled)
    c.drawString(54, 698, "Retention rate"); c.drawRightString(300, 698, retention)
    c.drawString(54, 684, "Net change"); c.drawRightString(300, 684, net)
    c.drawString(54, 670, "This sentence ends with a number, like 42.")
    c.save()
print("wrote src/documents/fixtures/report-*.pdf")
