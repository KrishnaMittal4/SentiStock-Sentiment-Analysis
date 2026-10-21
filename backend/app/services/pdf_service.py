"""
PDF export for a ticker's SentiStock AI snapshot — quote, technical
indicators, recent FinBERT-scored headlines, and the Groq AI Market
Brief, all in one shareable report.

Deliberately reuses the same dict shapes returned by
routers/stock.py, routers/news.py, and routers/insight.py (Quote,
Indicators, NewsResponse, Insight from schemas.py) rather than
re-fetching or re-deriving anything — this module only formats data
that some other service already computed and cached.
"""

from __future__ import annotations

import io
from typing import Any, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    HRFlowable,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# ---------------------------------------------------------------------
# Palette — kept close to variables.css (dark-theme accent colors read
# fine on a white PDF page as long as they're used for text/accents
# only, not as background fills)
# ---------------------------------------------------------------------
ACCENT = colors.HexColor("#06b6d4")   # --color-accent
BULLISH = colors.HexColor("#10b981")  # --color-bullish
BEARISH = colors.HexColor("#ef4444")  # --color-bearish
QUANT = colors.HexColor("#8b5cf6")    # --color-quant (technicals)
MUTED = colors.HexColor("#64748b")    # --text-muted
INK = colors.HexColor("#0f172a")      # --text-primary (light theme)


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "ReportTitle", parent=base["Title"], textColor=INK, fontSize=22, spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "ReportSubtitle", parent=base["Normal"], textColor=MUTED, fontSize=10, spaceAfter=14,
        ),
        "h2": ParagraphStyle(
            "H2", parent=base["Heading2"], textColor=INK, fontSize=13, spaceBefore=16, spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "Body", parent=base["Normal"], textColor=INK, fontSize=10, leading=15,
        ),
        "muted": ParagraphStyle(
            "Muted", parent=base["Normal"], textColor=MUTED, fontSize=8, leading=12,
        ),
        "brief": ParagraphStyle(
            "Brief", parent=base["Normal"], textColor=INK, fontSize=10.5, leading=16,
            backColor=colors.HexColor("#f5f3ff"), borderPadding=10,
        ),
    }


def _quote_block(styles: dict, quote: Optional[dict[str, Any]]) -> list:
    if not quote:
        return [Paragraph("No live quote available.", styles["muted"])]

    up = quote["change"] >= 0
    change_color = "#10b981" if up else "#ef4444"
    arrow = "&#9650;" if up else "&#9660;"

    price_line = Paragraph(
        f'<font size="20"><b>${quote["price"]:.2f}</b></font>&nbsp;&nbsp;'
        f'<font color="{change_color}">{arrow} {quote["change"]:+.2f} '
        f'({quote["change_pct"]:+.2f}%)</font>',
        styles["body"],
    )
    stats = Table(
        [[
            f'Open  ${quote["open"]:.2f}',
            f'High  ${quote["high"]:.2f}',
            f'Low  ${quote["low"]:.2f}',
            f'Prev Close  ${quote["prev_close"]:.2f}',
        ]],
        colWidths=[1.6 * inch] * 4,
    )
    stats.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 8.5),
        ("TEXTCOLOR", (0, 0), (-1, -1), MUTED),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
    ]))
    return [price_line, stats]


def _indicators_block(styles: dict, ind: Optional[dict[str, Any]]) -> list:
    if not ind:
        return [Paragraph("Not enough price history for technical indicators yet.", styles["muted"])]

    def fmt(v, prefix="", suffix="", decimals=2):
        return f"{prefix}{v:.{decimals}f}{suffix}" if v is not None else "—"

    rows = [
        ["RSI (14)", fmt(ind.get("rsi_14"), decimals=1)],
        ["MACD", fmt(ind.get("macd"))],
        ["MACD Signal", fmt(ind.get("macd_signal"))],
        ["MACD Histogram", fmt(ind.get("macd_hist"))],
        ["SMA 20", fmt(ind.get("sma_20"), prefix="$")],
        ["SMA 50", fmt(ind.get("sma_50"), prefix="$")],
        ["EMA 20", fmt(ind.get("ema_20"), prefix="$")],
        ["Bollinger Upper", fmt(ind.get("bb_upper"), prefix="$")],
        ["Bollinger Middle", fmt(ind.get("bb_middle"), prefix="$")],
        ["Bollinger Lower", fmt(ind.get("bb_lower"), prefix="$")],
    ]
    table = Table(rows, colWidths=[2.2 * inch, 1.8 * inch])
    table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9.5),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), INK),
        ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, colors.HexColor("#e2e8f0")),
    ]))
    engine_note = Paragraph(f"Engine: {ind.get('engine', 'unknown')}", styles["muted"])
    return [table, Spacer(1, 4), engine_note]


def _news_block(styles: dict, news: Optional[dict[str, Any]], limit: int = 8) -> list:
    articles = (news or {}).get("articles") or []
    if not articles:
        return [Paragraph("No recent news available.", styles["muted"])]

    label_color = {"positive": "#10b981", "negative": "#ef4444", "neutral": "#f59e0b"}
    flow: list = []
    for a in articles[:limit]:
        color = label_color.get(a.get("sentiment_label", "neutral"), "#f59e0b")
        flow.append(Paragraph(
            f'<font color="{color}"><b>[{a.get("sentiment_label", "neutral").upper()}]</b></font> '
            f'{a.get("headline", "")} '
            f'<font color="#64748b" size="8">— {a.get("source", "")}, {a.get("date", "")}</font>',
            styles["body"],
        ))
        flow.append(Spacer(1, 4))
    return flow


def build_report_pdf(
    symbol: str,
    quote: Optional[dict[str, Any]],
    indicators: Optional[dict[str, Any]],
    news: Optional[dict[str, Any]],
    insight: Optional[dict[str, Any]],
    generated_at: str,
) -> bytes:
    """Returns the PDF file as raw bytes (caller decides whether to
    stream it, write it to disk, or attach it to an email — nothing
    here touches the filesystem)."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.6 * inch, bottomMargin=0.6 * inch,
        leftMargin=0.7 * inch, rightMargin=0.7 * inch,
    )
    styles = _styles()
    story: list = []

    story.append(Paragraph(f"{symbol} — Market Snapshot", styles["title"]))
    story.append(Paragraph(f"Generated {generated_at} · SentiStock AI", styles["subtitle"]))
    story.append(HRFlowable(width="100%", color=colors.HexColor("#e2e8f0"), thickness=0.75))

    story.append(Paragraph("Quote", styles["h2"]))
    story.extend(_quote_block(styles, quote))

    if insight and insight.get("brief"):
        story.append(Paragraph("AI Market Brief", styles["h2"]))
        story.append(Paragraph(insight["brief"], styles["brief"]))
        story.append(Paragraph(f"Model: {insight.get('model', '')}", styles["muted"]))

    story.append(Paragraph("Technical Indicators", styles["h2"]))
    story.extend(_indicators_block(styles, indicators))

    story.append(Paragraph("Recent News & Sentiment", styles["h2"]))
    story.extend(_news_block(styles, news))

    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", color=colors.HexColor("#e2e8f0"), thickness=0.5))
    story.append(Paragraph(
        "Generated by SentiStock AI. Data sourced from Finnhub, yfinance, and "
        "VADER/Groq analysis. Not financial advice.",
        styles["muted"],
    ))

    doc.build(story)
    return buf.getvalue()
