# -*- coding: utf-8 -*-
"""Paleta i pomoćnici za prikaze u tiskanom diplomskom radu.

Uvezi na vrhu vlastite skripte za grafikone:

    from stil_grafikona import *
    primijeni_stil()
    ...
    osi(ax, "x")
    spremi(fig, "grafikon_1.png")

Obrazloženje svake odluke je u references/grafikoni.md.
"""
import re

import matplotlib
import matplotlib.ticker
matplotlib.use("Agg")
import matplotlib.pyplot as plt          # noqa: E402
import numpy as np                        # noqa: E402

DPI = 600
SIRINA_CM = 15.5                          # širina prikaza u dokumentu

# ── Paleta: tihi tisak s jednim naglaskom ───────────────────────────────────
# Podloga je bijela kao papir, pa se prikaz stapa sa stranicom umjesto da leži
# na obojenoj plohi. Sve nosivo je grafit; NAGLASAK se pojavljuje samo ondje
# gdje je nalaz, nikad kao ukras.
SURFACE    = "#ffffff"
INK        = "#111111"
INK_SOFT   = "#55524d"
GRID       = "#e7e4de"

NAGLASAK   = "#7c1f2e"
NAGL_SVIJ  = "#b06a74"
GRAFIT     = "#25262a"
SIVA       = "#8f8a82"
SIVA_SVIJ  = "#e0dbd3"
PLAVA      = "#2f4a5c"
PLAVA_SVIJ = "#7f97a8"

# Provjereno s dataviz/scripts/validate_palette.js:
#   slagani stupci  #7c1f2e,#e0dbd3,#8f8a82   normal ΔE 25.8 · CVD 25.8
#   divergentno     #7c1f2e,#b06a74,#e0dbd3,#7f97a8,#2f4a5c   normal ΔE 22.6
#   ishod (3)       #25262a,#8f8a82,#7c1f2e   normal ΔE 34.2
# Lightness band i chroma floor namjerno padaju: te su provjere kalibrirane za
# šarene ekranske palete, a ovo je tiskana i gotovo bezbojna.

HR = matplotlib.ticker.FuncFormatter(lambda v, _: f"{v:g}".replace(".", ","))
# Divergentni prikaz mjeri UDIO na obje strane sredine, pa lijeva strana nije
# negativna vrijednost nego udio neslaganja. Predznak se izostavlja.
HR_APS = matplotlib.ticker.FuncFormatter(lambda v, _: f"{abs(v):g}".replace(".", ","))


def primijeni_stil():
    plt.rcParams.update({
        "font.family": "serif",
        "font.serif": ["Liberation Serif", "Times New Roman", "DejaVu Serif"],
        "font.size": 9,
        "figure.facecolor": SURFACE, "axes.facecolor": SURFACE,
        "axes.edgecolor": INK, "axes.labelcolor": INK_SOFT, "text.color": INK,
        "xtick.color": INK, "ytick.color": INK,
        "axes.spines.top": False, "axes.spines.right": False,
        "axes.linewidth": 0.7,
        "xtick.direction": "out", "ytick.direction": "out",
        "xtick.major.size": 3.2, "ytick.major.size": 3.2,
        "xtick.major.width": 0.7, "ytick.major.width": 0.7,
        "savefig.dpi": DPI,
    })


def osi(ax, mreza="x"):
    """Tanke crne osi s vanjskim crticama. Mreža ostaje samo ondje gdje se
    vrijednost doista očitava; crtice samo na osi koja nosi brojke."""
    for k in ("top", "right"):
        ax.spines[k].set_visible(False)
    for k in ("left", "bottom"):
        ax.spines[k].set_visible(True)
        ax.spines[k].set_linewidth(0.7)
        ax.spines[k].set_color(INK)
    ax.set_axisbelow(True)
    if mreza == "x":
        ax.tick_params(axis="y", length=0)
        ax.xaxis.grid(True, color=GRID, linewidth=0.5, zorder=0)
    elif mreza == "y":
        ax.tick_params(axis="x", length=0)
        ax.yaxis.grid(True, color=GRID, linewidth=0.5, zorder=0)


def _samo_brojcane(os_):
    """Formatter smije na os SAMO ako sve njezine oznake nose brojke — inače
    pregazi nazive kategorija i zamijeni ih rednim brojevima."""
    for e in [t.get_text() for t in os_.get_ticklabels()]:
        if e and not re.fullmatch(r"[-−]?[\d.,]+", e):
            return False
    return True


def spremi(fig, ime):
    for a in fig.axes:
        if getattr(a.xaxis, "_zakljucan", False):
            pass
        elif _samo_brojcane(a.xaxis):
            a.xaxis.set_major_formatter(HR)
        if _samo_brojcane(a.yaxis):
            a.yaxis.set_major_formatter(HR)
    fig.savefig(ime, dpi=DPI, bbox_inches="tight", facecolor=SURFACE)
    plt.close(fig)
    print(f"✅ {ime}  ({DPI} dpi)")


def zakljucaj_os(ax, formatter=HR_APS):
    """Postavi vlastiti formatter i zaštiti ga od spremi()."""
    ax.xaxis.set_major_formatter(formatter)
    ax.xaxis._zakljucan = True


def ordinalni_ramp(n_):
    """Jedan ton, svjetlije → tamnije. Za UREĐENE kategorije (razine statusa,
    dobne skupine), nikad za nominalne."""
    kraj = np.linspace(0.22, 1.0, n_)
    return [(0.486 + (1 - t) * 0.38, 0.122 + (1 - t) * 0.40, 0.180 + (1 - t) * 0.36)
            for t in kraj]


def boja_oznake(stupac, prag=0.45):
    """Bijelo ili tinta, prema svjetlini stupca. Bijeli tekst na svijetlom
    koraku ordinalne skale pada ispod praga čitljivosti."""
    r_, g_, b_ = stupac.get_facecolor()[:3]
    return "#ffffff" if (0.2126 * r_ + 0.7152 * g_ + 0.0722 * b_) < prag else INK


def granice_divergentno(rows, korak=20, lijevi_zrak=8, desni_zrak=34):
    """Granice i oznake za divergentni prikaz — iz podataka, ne 'za svaki
    slučaj'. Preširoke granice ostave četvrtinu širine praznu.
    `rows` je niz torki u kojima je treći član lista udjela po stupnjevima."""
    lo = min(-(u[0] + u[1] + u[2] / 2) for *_, u, _ in rows)
    hi = max(-(u[0] + u[1] + u[2] / 2) + sum(u) for *_, u, _ in rows)
    kraj = int(np.ceil(max(abs(lo), hi) / korak) * korak)
    oznake = [t for t in range(-kraj, kraj + 1, korak) if lo - lijevi_zrak <= t <= hi + 4]
    return (lo - lijevi_zrak, hi + desni_zrak), oznake, hi
