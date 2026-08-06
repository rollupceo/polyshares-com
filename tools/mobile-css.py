#!/usr/bin/env python3
"""Push src/_mobile.css into every unpacked template.

Each page carries its own copy of the responsive rules inside the second
<style> block in <helmet>. This replaces everything from the first @media
rule to the end of that block with the shared mobile system, so there is
one source of truth instead of five drifting ones.

  python3 tools/mobile-css.py      # then: python3 tools/dcbundle.py pack
"""

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")
MARK = "/* === POLYSHARES MOBILE SYSTEM === */"

PAGES = ["index", "services", "case-studies", "it-providers", "team"]


def main():
    with open(os.path.join(SRC, "_mobile.css"), encoding="utf-8") as f:
        css = f.read().rstrip() + "\n"

    for name in PAGES:
        path = os.path.join(SRC, name + ".tpl.html")
        with open(path, encoding="utf-8") as f:
            tpl = f.read()

        # the style block that holds the layout rules is the one with `body {`
        m = re.search(r"<style>\n(  body \{.*?)</style>", tpl, re.S)
        if not m:
            print("!! no layout <style> in", name)
            continue

        block = m.group(1)
        cut = block.find(MARK)
        if cut < 0:
            cut = block.find("@media")
        if cut < 0:
            print("!! no @media / marker in", name)
            continue

        new = block[:cut].rstrip("\n ") + "\n\n" + MARK + "\n" + css
        tpl = tpl[: m.start(1)] + new + tpl[m.end(1) :]

        with open(path, "w", encoding="utf-8") as f:
            f.write(tpl)
        print("styled", name)


if __name__ == "__main__":
    main()
