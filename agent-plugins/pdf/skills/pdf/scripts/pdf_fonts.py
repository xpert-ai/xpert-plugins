"""ReportLab font registration; embed the installed TrueType Chinese font."""
import os
from pathlib import Path


def font_path():
    configured = os.environ.get('XPERT_PDF_FONT')
    path = Path(configured) if configured else Path.home() / '.local/share/xpert/pdf/fonts/NotoSansSC.ttf'
    if not path.is_file():
        raise RuntimeError('PDF font missing; run node tools/pdf-runtime/install.mjs or set XPERT_PDF_FONT')
    return path


def register_font(name='XpertCJK'):
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    if name not in pdfmetrics.getRegisteredFontNames():
        font = TTFont(name, str(font_path()))
        if not all(code in font.face.charWidths for code in [0x6587, 0x6863]):
            raise ValueError('Configured font does not cover the required Chinese glyphs')
        pdfmetrics.registerFont(font)
    return name
