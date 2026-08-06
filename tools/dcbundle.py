#!/usr/bin/env python3
"""Round-trip the bundled design-tool pages in this repo.

Each public page (index/services/case-studies/it-providers/team) is a single
self-contained HTML file produced by a bundler: the real markup lives as a
JSON string inside <script type="__bundler/template">, and every asset --
including the nested "Interactive Demo" document -- lives gzip+base64 encoded
inside <script type="__bundler/manifest">.

  unpack   pull the template (and the demo doc) out into src/ as plain HTML
  pack     write edited src/ files back into the page, byte-safe

Usage:
  python3 tools/dcbundle.py unpack
  python3 tools/dcbundle.py pack
"""

import base64
import gzip
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src")

PAGES = ["index", "services", "case-studies", "it-providers", "team"]

TPL_RE = re.compile(r'(<script type="__bundler/template">)(.*?)(</script>)', re.S)
MAN_RE = re.compile(r'(<script type="__bundler/manifest">)(.*?)(</script>)', re.S)
EXT_RE = re.compile(r'<script type="__bundler/ext_resources">(.*?)</script>', re.S)


def demo_uuid(html):
    """The Interactive Demo gets a fresh uuid per page, so resolve it by name."""
    m = EXT_RE.search(html)
    if not m:
        return None
    for entry in json.loads(m.group(1)):
        if "Interactive" in entry.get("id", ""):
            return entry["uuid"]
    return None


def enc_json(text):
    """JSON-encode the way the bundler does: escape </ so it can't close the tag."""
    return json.dumps(text, ensure_ascii=False).replace("</", "<\\u002F")


def page_path(name):
    return os.path.join(ROOT, name + ".html")


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def write(p, s):
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)


def unpack():
    os.makedirs(SRC, exist_ok=True)
    for name in PAGES:
        html = read(page_path(name))
        m = TPL_RE.search(html)
        if not m:
            print("!! no template in", name)
            continue
        write(os.path.join(SRC, name + ".tpl.html"), json.loads(m.group(2)))
        print("unpacked", name)

        uuid = demo_uuid(html)
        man = json.loads(MAN_RE.search(html).group(2))
        if uuid and uuid in man and name == "index":
            blob = gzip.decompress(base64.b64decode(man[uuid]["data"]))
            write(os.path.join(SRC, "interactive-demo.html"), blob.decode("utf-8"))
            print("unpacked interactive-demo (from %s)" % name)


def pack():
    demo_path = os.path.join(SRC, "interactive-demo.html")
    demo = read(demo_path) if os.path.exists(demo_path) else None

    for name in PAGES:
        tpl_path = os.path.join(SRC, name + ".tpl.html")
        if not os.path.exists(tpl_path):
            continue
        html = read(page_path(name))
        html = TPL_RE.sub(
            lambda m: m.group(1) + enc_json(read(tpl_path)) + m.group(3), html, count=1
        )

        uuid = demo_uuid(html)
        if demo is not None and uuid:
            def sub_man(m):
                man = json.loads(m.group(2))
                if uuid in man:
                    gz = gzip.compress(demo.encode("utf-8"), 9, mtime=0)
                    man[uuid]["data"] = base64.b64encode(gz).decode("ascii")
                    print("  embedded interactive-demo as", uuid)
                return m.group(1) + json.dumps(man, ensure_ascii=False) + m.group(3)

            html = MAN_RE.sub(sub_man, html, count=1)

        write(page_path(name), html)
        print("packed", name)

    # /about is a byte-for-byte copy of /team kept alive for legacy links.
    write(page_path("about"), read(page_path("team")))
    print("packed about (copy of team)")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "unpack":
        unpack()
    elif cmd == "pack":
        pack()
    else:
        print(__doc__)
        sys.exit(1)
